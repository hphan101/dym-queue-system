import { getBearerToken, getClientIp, isOriginAllowed, isRecord, jsonResponse, responseHeaders } from "../_shared/http.ts";
import { createAdminClient, getSupabaseSecretKey } from "../_shared/supabase.ts";
import {
  createQrChallenge, createRegistrationSessionToken, hashRegistrationSession,
  REGISTRATION_SESSION_MS, verifyQrChallenge,
} from "../_shared/registrationAccess.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) return jsonResponse({ code: "ORIGIN_NOT_ALLOWED" }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ code: "METHOD_NOT_ALLOWED" }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  const signingSecret = Deno.env.get("REGISTRATION_FINGERPRINT_SECRET");
  if (!url || !secretKey || !signingSecret) return jsonResponse({ code: "SERVER_NOT_CONFIGURED" }, 503, origin);

  try {
    if (Number(request.headers.get("content-length")) > 2048) return jsonResponse({ code: "INVALID_DATA" }, 413, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return jsonResponse({ code: "INVALID_DATA" }, 413, origin);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return jsonResponse({ code: "INVALID_DATA" }, 400, origin); }
    if (!isRecord(body) || !["q1", "q7", "hn"].includes(String(body.branch))) {
      return jsonResponse({ code: "INVALID_DATA" }, 400, origin);
    }
    const branch = String(body.branch);
    if (body.action !== "qr" && body.action !== "exchange") return jsonResponse({ code: "INVALID_DATA" }, 400, origin);
    const client = createAdminClient(url, secretKey);

    if (body.action === "qr") {
      const token = getBearerToken(request);
      if (!token) return jsonResponse({ code: "AUTH_REQUIRED" }, 401, origin);
      const { data: authData, error: authError } = await client.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse({ code: "AUTH_REQUIRED" }, 401, origin);
      const [{ data: profile, error: profileError }, { data: branchRow, error: branchError }] = await Promise.all([
        client.from("profiles").select("role, is_active").eq("user_id", authData.user.id).maybeSingle(),
        client.from("branches").select("id").eq("code", branch).eq("is_active", true).maybeSingle(),
      ]);
      if (profileError || branchError || !profile?.is_active || !branchRow) {
        return jsonResponse({ code: "ACCESS_DENIED" }, 403, origin);
      }
      if (profile.role !== "admin") {
        const { data: access, error } = await client.from("staff_branch_access")
          .select("branch_id").eq("user_id", authData.user.id).eq("branch_id", branchRow.id).maybeSingle();
        if (error || !access) return jsonResponse({ code: "ACCESS_DENIED" }, 403, origin);
      }
      const { error: cleanupError } = await client.rpc("purge_expired_registration_sessions");
      if (cleanupError) console.error(JSON.stringify({ code: "SESSION_CLEANUP_FAILED" }));
      return jsonResponse({ success: true, branch, ...await createQrChallenge(branch, signingSecret) }, 200, origin);
    }

    if (typeof body.challenge !== "string" ||
      await verifyQrChallenge(body.challenge, signingSecret) !== branch) {
      return jsonResponse({ code: "QR_EXPIRED" }, 403, origin);
    }
    const ipHash = await hashRegistrationSession(`access-ip|${signingSecret}|${getClientIp(request) ?? "unknown"}`);
    const { data: limits, error: limitError } = await client.rpc("consume_registration_ip_limit", {
      p_ip_hash: ipHash, p_max_requests: 600, p_window_seconds: 600,
    });
    const limit = Array.isArray(limits) ? limits[0] : limits;
    if (limitError) return jsonResponse({ code: "SERVER_ERROR" }, 503, origin);
    if (!limit?.allowed) return jsonResponse({ code: "RATE_LIMITED" }, 429, origin, { "Retry-After": "600" });
    const { data: branchRow, error: branchError } = await client.from("branches")
      .select("id").eq("code", branch).eq("is_active", true).maybeSingle();
    if (branchError || !branchRow) return jsonResponse({ code: "ACCESS_DENIED" }, 403, origin);
    const sessionToken = createRegistrationSessionToken();
    const now = Date.now();
    const expiresAt = new Date(now + REGISTRATION_SESSION_MS).toISOString();
    const { error } = await client.from("registration_access_sessions").insert({
      token_hash: await hashRegistrationSession(sessionToken), branch_id: branchRow.id, expires_at: expiresAt,
    });
    if (error) return jsonResponse({ code: "SERVER_ERROR" }, 503, origin);
    return jsonResponse({ success: true, branch, sessionToken, expiresAt, serverNow: new Date(now).toISOString() }, 200, origin);
  } catch {
    console.error(JSON.stringify({ code: "REGISTRATION_ACCESS_FAILED" }));
    return jsonResponse({ code: "SERVER_ERROR" }, 503, origin);
  }
});
