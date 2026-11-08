import {
  getClientIp,
  isOriginAllowed,
  isRecord,
  isSafeText,
  jsonResponse,
  responseHeaders,
} from "../_shared/http.ts";
import { createAdminClient, getSupabaseSecretKey } from "../_shared/supabase.ts";
import { hashRegistrationSession, SESSION_TOKEN_PATTERN } from "../_shared/registrationAccess.ts";

const MAX_REQUEST_BYTES = 16_384;
const COOLDOWN_SECONDS = 600;
const IP_RATE_LIMIT_REQUESTS = 600;
const IP_RATE_LIMIT_WINDOW_SECONDS = 600;
const PHONE_PATTERN = /^0(3|5|7|8|9)[0-9]{8}$/;
const IDENTITY_PATTERN = /^([0-9]{12}|[A-Z][A-Z0-9]{6,12})$/;
const BRANCHES = new Set(["q1", "q7", "hn"]);
const GENDERS = new Set(["Nam", "Nữ"]);
const VALID_CCCD_PROVINCE_CODES = new Set([
  "001", "002", "004", "006", "008", "010", "011", "012", "014", "015",
  "017", "019", "020", "022", "024", "025", "026", "027", "030", "031",
  "033", "034", "035", "036", "037", "038", "040", "042", "044", "045",
  "046", "048", "049", "051", "052", "054", "056", "058", "060", "062",
  "064", "066", "067", "068", "070", "072", "074", "075", "077", "079",
  "080", "082", "083", "084", "086", "087", "089", "091", "092", "093",
  "094", "095", "096",
]);

interface RegistrationPayload {
  branch: string;
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  cccd: string;
  province: string;
  ward: string;
  addressDetail: string;
  companyName: string;
  honeypot: string;
  tt25Extras: Record<string, unknown>;
}

interface IssuedRegistration {
  registration_id: string;
  queue_number: string;
  queue_date: string;
  registered_at: string;
}

interface IpLimitResult {
  allowed: boolean;
  retry_after_seconds: number;
}

function stringField(
  source: Record<string, unknown>,
  key: string,
  optional = false,
): string | null {
  const value = source[key];
  if (value === undefined && optional) return "";
  return typeof value === "string" ? value.trim().normalize("NFC") : null;
}

function sanitizeNestedText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim()
    .slice(0, maxLen);
  return isSafeText(cleaned, 0, maxLen) ? cleaned : "";
}

function sanitizeMedicalHistory(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const familyRaw = isRecord(raw.familyHistory) ? raw.familyHistory : {};
  const personalRaw = isRecord(raw.personalHistory) ? raw.personalHistory : {};
  const treatmentRaw = isRecord(raw.currentTreatment)
    ? raw.currentTreatment
    : {};
  const pregnancyRaw = isRecord(raw.pregnancyHistory)
    ? raw.pregnancyHistory
    : null;

  const personalHistory: Record<string, boolean> = {};
  for (let i = 1; i <= 22; i++) {
    const key = String(i);
    personalHistory[key] = Boolean(personalRaw[key]);
  }

  const result: Record<string, unknown> = {
    familyHistory: {
      hasDisease: Boolean(familyRaw.hasDisease),
      diseaseDetails: sanitizeNestedText(familyRaw.diseaseDetails, 300),
    },
    personalHistory,
    personalOtherDetails: sanitizeNestedText(raw.personalOtherDetails, 300),
    currentTreatment: {
      isTreating: Boolean(treatmentRaw.isTreating),
      medications: sanitizeNestedText(treatmentRaw.medications, 300),
    },
    commitmentAgreed: Boolean(raw.commitmentAgreed),
  };

  if (pregnancyRaw) {
    result.pregnancyHistory = {
      hasHistory: Boolean(pregnancyRaw.hasHistory),
      details: sanitizeNestedText(pregnancyRaw.details, 300),
    };
  }

  return result;
}

function sanitizeTargetPayment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const validGroups = new Set(["14", "15", "16", "other"]);
  const validSources = new Set(["employer", "self", "other"]);
  const validLocations = new Set([
    "cs_kbcb",
    "kham_luu_dong",
    "tram_y_te",
    "truong_hoc",
    "ksk_tai_nha",
  ]);

  const targetGroup =
    typeof raw.targetGroup === "string" && validGroups.has(raw.targetGroup)
      ? raw.targetGroup
      : "15";
  const paymentSource =
    typeof raw.paymentSource === "string" && validSources.has(raw.paymentSource)
      ? raw.paymentSource
      : "employer";
  const examLocation =
    typeof raw.examLocation === "string" && validLocations.has(raw.examLocation)
      ? raw.examLocation
      : "cs_kbcb";

  return {
    targetGroup,
    targetOtherDetails: sanitizeNestedText(raw.targetOtherDetails, 200),
    paymentSource,
    paymentOtherDetails: sanitizeNestedText(raw.paymentOtherDetails, 200),
    examLocation,
  };
}

function parsePayload(value: unknown): RegistrationPayload | null {
  if (!isRecord(value)) return null;

  const branch = stringField(value, "branch");
  const fullName = stringField(value, "fullName");
  const phoneNumber = stringField(value, "phoneNumber");
  const birthDate = stringField(value, "birthDate");
  const gender = stringField(value, "gender");
  const cccd = stringField(value, "cccd");
  const province = stringField(value, "province");
  const ward = stringField(value, "ward");
  const addressDetail = stringField(value, "addressDetail");
  const companyName = stringField(value, "companyName", true);
  const honeypot = stringField(value, "honeypot", true);

  if (
    branch === null ||
    fullName === null ||
    phoneNumber === null ||
    birthDate === null ||
    gender === null ||
    cccd === null ||
    province === null ||
    ward === null ||
    addressDetail === null ||
    companyName === null ||
    honeypot === null
  ) {
    return null;
  }

  const tt25Extras: Record<string, unknown> = {};
  const optionalTextFields: Array<[string, number]> = [
    ["ethnicity", 60],
    ["bloodGroup", 20],
    ["insuranceNumber", 30],
    ["occupation", 120],
    ["workplaceProvince", 120],
    ["workplaceWard", 160],
    ["checkupReason", 160],
    ["language", 20],
    ["email", 120],
  ];

  for (const [key, maxLen] of optionalTextFields) {
    const val = stringField(value, key, true);
    if (val !== null && val.length <= maxLen && isSafeText(val, 0, maxLen)) {
      tt25Extras[key] = val;
    }
  }

  if (isRecord(value.medicalHistory)) {
    tt25Extras.medicalHistory = sanitizeMedicalHistory(value.medicalHistory);
  }
  if (isRecord(value.targetPayment)) {
    tt25Extras.targetPayment = sanitizeTargetPayment(value.targetPayment);
  }
  if (typeof value.consentAgreed === "boolean") {
    tt25Extras.consentAgreed = value.consentAgreed;
  }

  return {
    branch: branch.toLowerCase(),
    fullName,
    phoneNumber: phoneNumber.replace(/[^0-9]/g, ""),
    birthDate,
    gender,
    cccd: cccd.toUpperCase(),
    province,
    ward,
    addressDetail,
    companyName: companyName || (/work permit|khám sức khỏe khác/i.test(String(tt25Extras.checkupReason ?? '')) ? 'Lao động tự do' : ''),
    honeypot,
    tt25Extras,
  };
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= 1900 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidIdentityDocument(
  cccd: string,
  gender: string,
  birthDate: string,
): boolean {
  if (!IDENTITY_PATTERN.test(cccd)) return false;

  // Foreign passport starting with an uppercase letter
  if (/^[A-Z][A-Z0-9]{6,12}$/.test(cccd)) {
    return true;
  }

  // 12-digit Vietnamese CCCD rules
  if (!/^\d{12}$/.test(cccd)) return false;

  const provinceCode = cccd.slice(0, 3);
  if (!VALID_CCCD_PROVINCE_CODES.has(provinceCode)) return false;

  const birthYear = Number(birthDate.slice(0, 4));
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > 2399) {
    return false;
  }

  const centuryIndex = Math.floor((birthYear - 1900) / 100);
  const expectedGenderDigit = centuryIndex * 2 + (gender === "Nữ" ? 1 : 0);
  if (Number(cccd[3]) !== expectedGenderDigit) {
    return false;
  }

  const expectedYearCode = String(birthYear).slice(-2);
  if (cccd.slice(4, 6) !== expectedYearCode) {
    return false;
  }

  return true;
}

function isValidPayload(payload: RegistrationPayload): boolean {
  return (
    BRANCHES.has(payload.branch) &&
    isSafeText(payload.fullName, 2, 100) &&
    PHONE_PATTERN.test(payload.phoneNumber) &&
    isValidDate(payload.birthDate) &&
    GENDERS.has(payload.gender) &&
    isValidIdentityDocument(payload.cccd, payload.gender, payload.birthDate) &&
    isSafeText(payload.companyName, /công ty|doanh nghiệp/i.test(String(payload.tt25Extras.checkupReason ?? '')) ? 1 : 0, 150) &&
    isSafeText(payload.province, 1, 120) &&
    isSafeText(payload.ward, 1, 120) &&
    isSafeText(payload.addressDetail, 3, 250) &&
    isSafeText(payload.honeypot, 0, 200)
  );
}

async function createHmac(
  value: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createFingerprint(
  payload: RegistrationPayload,
  secret: string,
): Promise<string> {
  return createHmac(
    `${payload.phoneNumber}|${payload.cccd}|${payload.branch}`,
    secret,
  );
}


function databaseErrorText(error: {
  message?: string;
  details?: string;
  hint?: string;
}): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

function formatQueueNumber(value: string): string {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue)
    ? String(parsedValue).padStart(3, "0")
    : value;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin)) {
    return jsonResponse(
      { success: false, code: "ORIGIN_NOT_ALLOWED", error: "Nguồn truy cập không được phép." },
      403,
      origin,
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, code: "METHOD_NOT_ALLOWED", error: "Phương thức không được hỗ trợ." },
      405,
      origin,
      { Allow: "POST, OPTIONS" },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(
      { success: false, code: "PAYLOAD_TOO_LARGE", error: "Dữ liệu gửi lên quá lớn." },
      413,
      origin,
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse(
      { success: false, code: "INVALID_DATA", error: "Dữ liệu đăng ký không hợp lệ." },
      400,
      origin,
    );
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonResponse(
      { success: false, code: "PAYLOAD_TOO_LARGE", error: "Dữ liệu gửi lên quá lớn." },
      413,
      origin,
    );
  }

  let payload: RegistrationPayload | null = null;
  let sessionToken = "";
  try {
    const decoded: unknown = JSON.parse(rawBody);
    payload = parsePayload(decoded);
    if (isRecord(decoded) && typeof decoded.registrationSession === "string") sessionToken = decoded.registrationSession;
  } catch {
    // Handled by the common invalid payload response below.
  }

  if (!payload || !isValidPayload(payload)) {
    return jsonResponse(
      {
        success: false,
        code: "INVALID_DATA",
        error: "Dữ liệu đăng ký không hợp lệ. Vui lòng kiểm tra lại thông tin.",
      },
      400,
      origin,
    );
  }

  if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
    return jsonResponse({ success: false, code: "REGISTRATION_SESSION_INVALID", error: "Vui lòng quét mã QR tại phòng khám để đăng ký." }, 403, origin);
  }

  // Bots that fill the hidden field receive a plausible response, but no row
  // is inserted and no queue number is consumed.
  if (payload.honeypot) {
    return jsonResponse(
      { success: true, queueNumber: "999" },
      200,
      origin,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseSecretKey = getSupabaseSecretKey();
  const fingerprintSecret = Deno.env.get("REGISTRATION_FINGERPRINT_SECRET");

  if (!supabaseUrl || !supabaseSecretKey || !fingerprintSecret) {
    console.error(JSON.stringify({ requestId, code: "SERVER_NOT_CONFIGURED" }));
    return jsonResponse(
      { success: false, code: "SERVER_ERROR", error: "Hệ thống đang được cấu hình. Vui lòng thử lại sau." },
      503,
      origin,
    );
  }

  try {
    const fingerprint = await createFingerprint(payload, fingerprintSecret);
    const supabase = createAdminClient(supabaseUrl, supabaseSecretKey);

    const clientIp = getClientIp(request);
    const rateLimitIp = clientIp ?? "missing-client-ip";
    const maxIpRequests = clientIp ? IP_RATE_LIMIT_REQUESTS : 30;
    const ipHash = await createHmac(`ip|${rateLimitIp}`, fingerprintSecret);
    const { data: ipLimitData, error: ipLimitError } = await supabase.rpc(
      "consume_registration_ip_limit",
      {
        p_ip_hash: ipHash,
        p_max_requests: maxIpRequests,
        p_window_seconds: IP_RATE_LIMIT_WINDOW_SECONDS,
      },
    );

    if (ipLimitError) {
      console.error(
        JSON.stringify({
          requestId,
          code: "IP_RATE_LIMIT_ERROR",
          databaseCode: ipLimitError.code,
        }),
      );
      return jsonResponse(
        {
          success: false,
          code: "SERVER_ERROR",
          error: "Hệ thống đang bận. Vui lòng thử lại sau.",
        },
        503,
        origin,
      );
    }

    const ipLimit = (
      Array.isArray(ipLimitData) ? ipLimitData[0] : ipLimitData
    ) as IpLimitResult | undefined;

    if (ipLimit && !ipLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Number(ipLimit.retry_after_seconds) ||
          IP_RATE_LIMIT_WINDOW_SECONDS,
      );
      return jsonResponse(
        {
          success: false,
          code: "RATE_LIMITED",
          error:
            "Có quá nhiều yêu cầu từ mạng này. Vui lòng thử lại sau ít phút.",
        },
        429,
        origin,
        { "Retry-After": String(retryAfter) },
      );
    }

    const { data, error } = await supabase.rpc("issue_registration_with_session", {
      p_session_hash: await hashRegistrationSession(sessionToken),
      p_request_hash: await createHmac(`registration-request|${JSON.stringify(payload)}`, fingerprintSecret),
      p_branch_code: payload.branch,
      p_full_name: payload.fullName.trim().toUpperCase(),
      p_birth_date: payload.birthDate,
      p_gender: payload.gender,
      p_phone_number: payload.phoneNumber,
      p_identity_document: payload.cccd,
      p_company_name: payload.companyName,
      p_province: payload.province,
      p_ward: payload.ward,
      p_address_detail: payload.addressDetail,
      p_fingerprint: fingerprint,
      p_cooldown_seconds: COOLDOWN_SECONDS,
      p_tt25_data: payload.tt25Extras,
    });

    if (error) {
      const errorText = databaseErrorText(error);
      if (errorText.includes("REGISTRATION_SESSION_")) {
        return jsonResponse({
          success: false,
          code: errorText.includes("REGISTRATION_SESSION_EXPIRED") ? "REGISTRATION_SESSION_EXPIRED" : "REGISTRATION_SESSION_INVALID",
          error: "Phiên đăng ký đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại phòng khám.",
        }, 403, origin);
      }
      if (errorText.includes("RATE_LIMITED")) {
        return jsonResponse(
          {
            success: false,
            code: "RATE_LIMITED",
            error: "Thông tin này vừa được đăng ký. Vui lòng thử lại sau 10 phút.",
          },
          429,
          origin,
          { "Retry-After": String(COOLDOWN_SECONDS) },
        );
      }

      if (
        errorText.includes("INVALID_DATA") ||
        errorText.includes("INVALID_BRANCH") ||
        errorText.includes("PAYLOAD_TOO_LARGE")
      ) {
        return jsonResponse(
          {
            success: false,
            code: "INVALID_DATA",
            error: "Dữ liệu đăng ký không hợp lệ. Vui lòng kiểm tra lại thông tin.",
          },
          400,
          origin,
        );
      }

      console.error(
        JSON.stringify({
          requestId,
          code: "DATABASE_ERROR",
          databaseCode: error.code,
        }),
      );
      return jsonResponse(
        { success: false, code: "SERVER_ERROR", error: "Không thể cấp số thứ tự. Vui lòng thử lại." },
        500,
        origin,
      );
    }

    const issued = (Array.isArray(data) ? data[0] : data) as
      | IssuedRegistration
      | undefined;

    if (!issued?.queue_number) {
      console.error(JSON.stringify({ requestId, code: "EMPTY_DATABASE_RESPONSE" }));
      return jsonResponse(
        { success: false, code: "SERVER_ERROR", error: "Không thể cấp số thứ tự. Vui lòng thử lại." },
        500,
        origin,
      );
    }

    return jsonResponse(
      {
        success: true,
        queueNumber: formatQueueNumber(issued.queue_number),
        queueDate: issued.queue_date,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        requestId,
        code: "UNHANDLED_ERROR",
        name: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return jsonResponse(
      { success: false, code: "SERVER_ERROR", error: "Không thể kết nối hệ thống. Vui lòng thử lại." },
      500,
      origin,
    );
  }
});
