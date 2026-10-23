import {
  getClientIp,
  isOriginAllowed,
  isRecord,
  isSafeText,
  jsonResponse,
  responseHeaders,
} from "../_shared/http.ts";
import { createAdminClient, getSupabaseSecretKey } from "../_shared/supabase.ts";

const MAX_REQUEST_BYTES = 16_384;
const COOLDOWN_SECONDS = 600;
const IP_RATE_LIMIT_REQUESTS = 250;
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
  ];

  for (const [key, maxLen] of optionalTextFields) {
    const val = stringField(value, key, true);
    if (val !== null && val.length <= maxLen && isSafeText(val, 0, maxLen)) {
      tt25Extras[key] = val;
    }
  }

  if (isRecord(value.medicalHistory)) {
    tt25Extras.medicalHistory = value.medicalHistory;
  }
  if (isRecord(value.targetPayment)) {
    tt25Extras.targetPayment = value.targetPayment;
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
    companyName,
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
    isSafeText(payload.companyName, 0, 150) &&
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
  try {
    payload = parsePayload(JSON.parse(rawBody));
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
    if (clientIp) {
      const ipHash = await createHmac(`ip|${clientIp}`, fingerprintSecret);
      const { data: ipLimitData, error: ipLimitError } = await supabase.rpc(
        "consume_registration_ip_limit",
        {
          p_ip_hash: ipHash,
          p_max_requests: IP_RATE_LIMIT_REQUESTS,
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
    }

    const { data, error } = await supabase.rpc("issue_registration", {
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
    });

    if (error) {
      const errorText = databaseErrorText(error);
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
        errorText.includes("INVALID_BRANCH")
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

    const parsedQueueInt = Number.parseInt(String(issued.queue_number), 10);
    if (
      Number.isFinite(parsedQueueInt) &&
      Object.keys(payload.tt25Extras).length > 0
    ) {
      const { error: extrasError } = await supabase.rpc(
        "save_registration_tt25_data",
        {
          p_branch_code: payload.branch,
          p_queue_number: parsedQueueInt,
          p_identity_document: payload.cccd,
          p_tt25_data: payload.tt25Extras,
        },
      );
      if (extrasError) {
        console.warn(
          JSON.stringify({
            requestId,
            code: "TT25_EXTRAS_SAVE_WARNING",
            databaseCode: extrasError.code,
          }),
        );
      }
    }

    return jsonResponse(
      {
        success: true,
        queueNumber: formatQueueNumber(issued.queue_number),
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
