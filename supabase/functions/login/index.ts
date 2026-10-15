import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isOriginAllowed,
  jsonResponse,
  responseHeaders,
} from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const MAX_REQUEST_BYTES = 4_096;
const MAX_ACCOUNTS = 1_000;
const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; expiresAt: number }>();

function getSupabaseSecretKey(): string | null {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey) return serviceRoleKey;

  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, unknown>).default;
      if (typeof key === "string" && key) return key;
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_SECRET_KEYS" }));
    }
  }
  return null;
}

function getSupabasePublishableKey(): string | null {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, unknown>).default;
      if (typeof key === "string" && key) return key;
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_PUBLISHABLE_KEYS" }));
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

function requestKey(request: Request, loginName: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded ?? "unknown"}:${loginName}`;
}

function mayAttempt(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!mayAttempt(requestKey(request, loginName))) {
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

    if (!directError && directData?.session) {
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

    // Fallback path: Tìm kiếm tài khoản legacy hoặc tài khoản quản trị viên ban đầu
    const adminClient = createAdminClient(supabaseUrl, secretKey);
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

    if (!account?.email) {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    // Tránh thử lại nếu đã thử đúng email này ở fast-path
    if (account.email.toLowerCase() === standardInternalEmail) {
      return jsonResponse({ success: false, code: "INVALID_CREDENTIALS" }, 401, origin);
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email: account.email,
      password,
    });
    if (error || !data.session) {
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
