import { hasPermission } from "../_shared/staffPermissions.ts";
import { getBearerToken, getClientIp, isOriginAllowed, isRecord, jsonResponse, responseHeaders } from "../_shared/http.ts";
import { createAdminClient, getSupabaseSecretKey } from "../_shared/supabase.ts";
import { countExpiredQrFailure } from "../_shared/registrationFailureResponse.ts";
import {
  createQrChallenge, createRegistrationSessionToken, hashRegistrationSession,
  REGISTRATION_SESSION_MS, SESSION_TOKEN_PATTERN, verifyQrChallenge,
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
    if (Number(request.headers.get("content-length")) > 4096) return jsonResponse({ code: "INVALID_DATA" }, 413, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return jsonResponse({ code: "INVALID_DATA" }, 413, origin);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return jsonResponse({ code: "INVALID_DATA" }, 400, origin); }
    if (!isRecord(body) || !["q1", "q7", "hn"].includes(String(body.branch))) {
      return jsonResponse({ code: "INVALID_DATA" }, 400, origin);
    }
    const branch = String(body.branch);
    if (body.action !== "qr" && body.action !== "exchange" && body.action !== "edit-registration") {
      return jsonResponse({ code: "INVALID_DATA" }, 400, origin);
    }
    const client = createAdminClient(url, secretKey);

    if (body.action === "qr") {
      const token = getBearerToken(request);
      if (!token) return jsonResponse({ code: "AUTH_REQUIRED" }, 401, origin);
      const { data: authData, error: authError } = await client.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse({ code: "AUTH_REQUIRED" }, 401, origin);
      const [{ data: profile, error: profileError }, { data: branchRow, error: branchError }] = await Promise.all([
        client.from("profiles").select("role, is_active, permissions").eq("user_id", authData.user.id).maybeSingle(),
        client.from("branches").select("id").eq("code", branch).eq("is_active", true).maybeSingle(),
      ]);
      const permitted = profile && (body.purpose === 'staff'
        ? hasPermission(profile.role, profile.permissions, 'registrations', 'create')
        : hasPermission(profile.role, profile.permissions, 'registration_qr'));
      if (profileError || branchError || !profile?.is_active || !branchRow || !permitted) {
        return jsonResponse({ code: "ACCESS_DENIED" }, 403, origin);
      }
      if (profile.role !== "admin" || profile.permissions != null) {
        const { data: access, error } = await client.from("staff_branch_access")
          .select("branch_id").eq("user_id", authData.user.id).eq("branch_id", branchRow.id).maybeSingle();
        if (error || !access) return jsonResponse({ code: "ACCESS_DENIED" }, 403, origin);
      }
      const { error: cleanupError } = await client.rpc("purge_expired_registration_sessions");
      if (cleanupError) console.error(JSON.stringify({ code: "SESSION_CLEANUP_FAILED" }));
      return jsonResponse({ success: true, branch, ...await createQrChallenge(branch, signingSecret) }, 200, origin);
    }

    if (body.action === "edit-registration") {
      if (typeof body.sessionToken !== "string" || !SESSION_TOKEN_PATTERN.test(body.sessionToken)) {
        return jsonResponse({ code: "EDIT_SESSION_INVALID" }, 403, origin);
      }
      if (body.changes !== undefined && !isRecord(body.changes)) {
        return jsonResponse({ code: "INVALID_DATA" }, 400, origin);
      }
    } else {
      const now = Date.now();
      if (typeof body.challenge !== "string") return jsonResponse({ code: "QR_EXPIRED" }, 403, origin);
      if (await verifyQrChallenge(body.challenge, signingSecret, now) !== branch) {
        return countExpiredQrFailure(jsonResponse({ code: "QR_EXPIRED" }, 403, origin),
          client, branch, body.challenge, signingSecret, getClientIp(request), now);
      }
    }
    const rateLimitScope = body.action === "edit-registration" ? "edit-ip" : "access-ip";
    const ipHash = await hashRegistrationSession(`${rateLimitScope}|${signingSecret}|${getClientIp(request) ?? "unknown"}`);
    const { data: limits, error: limitError } = await client.rpc("consume_registration_ip_limit", {
      p_ip_hash: ipHash, p_max_requests: 600, p_window_seconds: 600,
    });
    const limit = Array.isArray(limits) ? limits[0] : limits;
    if (limitError) return jsonResponse({ code: "SERVER_ERROR" }, 503, origin);
    if (!limit?.allowed) return jsonResponse({ code: "RATE_LIMITED" }, 429, origin, { "Retry-After": "600" });

    if (body.action === "edit-registration" && typeof body.sessionToken === "string") {
      const { data, error } = await client.rpc("edit_registration_with_session", {
        p_session_hash: await hashRegistrationSession(body.sessionToken),
        p_branch_code: branch,
        p_changes: body.changes ?? null,
      });
      switch (error?.message) {
        case "EDIT_SESSION_INVALID": return jsonResponse({ code: error.message }, 403, origin);
        case "EDIT_SESSION_EXPIRED":
        case "EDIT_LOCKED": return jsonResponse({ code: error.message }, 409, origin);
        case "INVALID_DATA": return jsonResponse({
          code: error.hint === "passport_name" ? "INVALID_PASSPORT_NAME" : error.message,
          field: error.details || undefined,
        }, 400, origin);
      }
      if (error || !data) return jsonResponse({ code: "SERVER_ERROR" }, 503, origin);
      return jsonResponse({ success: true, ...data }, 200, origin);
    }

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
