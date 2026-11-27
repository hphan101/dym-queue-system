import {
  getClientIp,
  isOriginAllowed,
  isRecord,
  jsonResponse,
  responseHeaders,
} from "../_shared/http.ts";
import { createAdminClient, getSupabaseSecretKey } from "../_shared/supabase.ts";
import { createHmac, hashRegistrationRequest, hashRegistrationSession, SESSION_TOKEN_PATTERN } from "../_shared/registrationAccess.ts";
import { countSubmissionFailure } from "../_shared/registrationFailureResponse.ts";
import { getInvalidPayloadField, parsePayload, type RegistrationPayload } from "../_shared/registrationPayload.ts";

const MAX_REQUEST_BYTES = 16_384;
const COOLDOWN_SECONDS = 600;
const IP_RATE_LIMIT_REQUESTS = 600;
const IP_RATE_LIMIT_WINDOW_SECONDS = 600;

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
  let reportBranch = "";
  const invalidFields: string[] = [];
  try {
    const decoded: unknown = JSON.parse(rawBody);
    payload = parsePayload(decoded, invalidFields);
    if (isRecord(decoded) && typeof decoded.registrationSession === "string") {
      sessionToken = decoded.registrationSession;
      if (!decoded.honeypot && typeof decoded.branch === "string") reportBranch = decoded.branch;
    }
  } catch {
    // Handled by the common invalid payload response below.
  }
  const failure = (body: { code: string; [key: string]: unknown }, status: number, headers?: Record<string, string>) =>
    countSubmissionFailure(jsonResponse(body, status, origin, headers), reportBranch, body.code, sessionToken);

  const invalidField = payload ? getInvalidPayloadField(payload) : invalidFields[0];
  if (!payload || invalidField) {
    return failure(
      {
        success: false,
        code: "INVALID_DATA",
        field: invalidField,
        error: "Dữ liệu đăng ký không hợp lệ. Vui lòng kiểm tra lại thông tin.",
      },
      400,
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
    return failure(
      { success: false, code: "SERVER_ERROR", error: "Hệ thống đang được cấu hình. Vui lòng thử lại sau." },
      503,
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
      return failure(
        {
          success: false,
          code: "SERVER_ERROR",
          error: "Hệ thống đang bận. Vui lòng thử lại sau.",
        },
        503,
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
      p_request_hash: await hashRegistrationRequest(payload, fingerprintSecret),
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
        return failure({
          success: false,
          code: errorText.includes("REGISTRATION_SESSION_EXPIRED") ? "REGISTRATION_SESSION_EXPIRED" : "REGISTRATION_SESSION_INVALID",
          error: "Phiên đăng ký đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại phòng khám.",
        }, 403);
      }
      if (error.message === "IDENTITY_DOCUMENT_COOLDOWN") {
        const retryAfter = Math.max(1, Math.min(3600, Number(error.details) || 3600));
        const minutes = Math.ceil(retryAfter / 60);
        const passport = error.hint === "passport";
        return failure({
          success: false,
          code: "IDENTITY_DOCUMENT_COOLDOWN",
          error: payload.tt25Extras.language === "en"
            ? `This ${passport ? "passport" : "Citizen ID"} was recently registered at this branch. Please try again in ${minutes} min.`
            : `${passport ? "Hộ chiếu" : "CCCD"} này vừa được đăng ký tại chi nhánh này. Vui lòng thử lại sau ${minutes} phút.`,
        }, 429, { "Retry-After": String(retryAfter) });
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
        return failure(
          {
            success: false,
            code: "INVALID_DATA",
            error: "Dữ liệu đăng ký không hợp lệ. Vui lòng kiểm tra lại thông tin.",
          },
          400,
        );
      }

      console.error(
        JSON.stringify({
          requestId,
          code: "DATABASE_ERROR",
          databaseCode: error.code,
        }),
      );
      return failure(
        { success: false, code: "SERVER_ERROR", error: "Không thể cấp số thứ tự. Vui lòng thử lại." },
        500,
      );
    }

    const issued = (Array.isArray(data) ? data[0] : data) as
      | IssuedRegistration
      | undefined;

    if (!issued?.queue_number) {
      console.error(JSON.stringify({ requestId, code: "EMPTY_DATABASE_RESPONSE" }));
      return failure(
        { success: false, code: "SERVER_ERROR", error: "Không thể cấp số thứ tự. Vui lòng thử lại." },
        500,
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
    return failure(
      { success: false, code: "SERVER_ERROR", error: "Không thể kết nối hệ thống. Vui lòng thử lại." },
      500,
    );
  }
});
