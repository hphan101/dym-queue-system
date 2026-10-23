import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  getClientIp,
  isOriginAllowed,
  isRecord,
  jsonResponse,
  LOGIN_NAME_PATTERN,
  responseHeaders,
} from "../_shared/http.ts";
import {
  createAdminClient,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from "../_shared/supabase.ts";

const MAX_REQUEST_BYTES = 4_096;
const MAX_ACCOUNTS = 1_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_WINDOW_SECONDS = 600;
const RATE_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; expiresAt: number }>();

function cleanupExpiredAttempts(now: number) {
  if (attempts.size < 500) return;
  for (const [k, v] of attempts.entries()) {
    if (v.expiresAt <= now) {
      attempts.delete(k);
    }
  }
}

function requestKey(request: Request, loginName: string) {
  const clientIp = getClientIp(request) ?? "unknown";
  return `${clientIp}:${loginName}`;
}

function mayAttemptInMemory(key: string): boolean {
  const now = Date.now();
  cleanupExpiredAttempts(now);
  const entry = attempts.get(key);
  if (!entry || entry.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function checkPersistentLoginRateLimit(
  adminClient: SupabaseClient,
  key: string,
): Promise<boolean> {
  try {
    const keyHash = await sha256Hex(`login_rate_limit|${key}`);
    const { data, error } = await adminClient.rpc(
      "consume_registration_ip_limit",
      {
        p_ip_hash: keyHash,
        p_max_requests: RATE_MAX_ATTEMPTS,
        p_window_seconds: RATE_WINDOW_SECONDS,
      },
    );
    if (error) return true;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean }
      | undefined;
    return row ? Boolean(row.allowed) : true;
  } catch {
    return true;
  }
}

async function isActiveStaffAccount(
  adminClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean(data.is_active);
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ success: false, code: "ORIGIN_NOT_ALLOWED" }, 403, origin);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ success: false, code: "METHOD_NOT_ALLOWED" }, 405, origin, {
      Allow: "POST, OPTIONS",
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 400, origin);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 400, origin);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isRecord(parsed)) throw new Error("INVALID_BODY");
    body = parsed;
  } catch {
    return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 400, origin);
  }

  const loginName = typeof body.loginName === "string"
    ? body.loginName.trim().toLowerCase()
    : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!LOGIN_NAME_PATTERN.test(loginName) || !password || password.length > 72) {
    return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
  }

  const rateKey = requestKey(request, loginName);
  if (!mayAttemptInMemory(rateKey)) {
    return jsonResponse({ success: false, code: "OVER_REQUEST_RATE_LIMIT" }, 429, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  const publishableKey = getSupabasePublishableKey();
  if (!supabaseUrl || !secretKey || !publishableKey) {
    console.error(JSON.stringify({ code: "SERVER_NOT_CONFIGURED" }));
    return jsonResponse({ success: false, code: "SERVER_ERROR" }, 500, origin);
  }

  try {
    const adminClient = createAdminClient(supabaseUrl, secretKey);
    const allowedPersistent = await checkPersistentLoginRateLimit(
      adminClient,
      rateKey,
    );
    if (!allowedPersistent) {
      return jsonResponse(
        { success: false, code: "OVER_REQUEST_RATE_LIMIT" },
        429,
        origin,
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fast-path: Thử đăng nhập trực tiếp với email format chuẩn nội bộ
    const standardInternalEmail = `${loginName}@accounts.dym.internal`;
    const { data: directData, error: directError } =
      await authClient.auth.signInWithPassword({
        email: standardInternalEmail,
        password,
      });

    if (!directError && directData?.session && directData.user) {
      const active = await isActiveStaffAccount(adminClient, directData.user.id);
      if (!active) {
        return jsonResponse(
          { success: false, code: "INVALID_CREDENTIALS" },
          401,
          origin,
        );
      }

      return jsonResponse(
        {
          success: true,
          session: {
            access_token: directData.session.access_token,
            refresh_token: directData.session.refresh_token,
          },
        },
        200,
        origin,
      );
    }

    // Chỉ thực hiện fallback tìm kiếm email legacy đối với tài khoản quản trị khởi tạo ban đầu
    if (loginName !== "admin") {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: MAX_ACCOUNTS,
    });
    if (usersError) throw usersError;

    const account = users.users.find((user) => {
      const storedName = user.user_metadata?.login_name;
      const legacyName = user.email?.split("@")[0];
      return String(storedName ?? legacyName ?? "").toLowerCase() === loginName;
    });

    if (!account?.email || account.email.toLowerCase() === standardInternalEmail) {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email: account.email,
      password,
    });
    if (error || !data.session || !data.user) {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    const active = await isActiveStaffAccount(adminClient, data.user.id);
    if (!active) {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    return jsonResponse({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    }, 200, origin);
  } catch (error) {
    console.error(JSON.stringify({
      code: "LOGIN_FAILED",
      message: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ success: false, code: "SERVER_ERROR" }, 500, origin);
  }
});
