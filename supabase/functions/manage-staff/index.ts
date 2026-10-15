import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  isOriginAllowed,
  jsonResponse,
  responseHeaders,
} from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

function getSupabaseSecretKey(): string | null {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.length > 0) {
        return defaultKey;
      }
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_SECRET_KEYS" }));
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function getSupabasePublishableKey(): string | null {
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.length > 0) {
        return defaultKey;
      }
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_PUBLISHABLE_KEYS" }));
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

const MAX_REQUEST_BYTES = 16_384;
const MAX_STAFF_ACCOUNTS = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BRANCH_CODES = new Set(["q1", "q7", "hn"]);
const ALLOWED_ROLES = new Set(["admin", "receptionist"]);

type StaffRole = "admin" | "receptionist";

interface StaffInput {
  displayName: string;
  role: StaffRole;
  branchCodes: string[];
}

interface CreateStaffInput extends StaffInput {
  action: "create";
  loginName: string;
  password: string;
}

interface UpdateStaffInput extends StaffInput {
  action: "update";
  userId: string;
  loginName: string;
}

interface SetActiveInput {
  action: "set-active";
  userId: string;
  isActive: boolean;
}

interface ResetPasswordInput {
  action: "reset-password";
  userId: string;
  password: string;
}

type StaffRequest = CreateStaffInput | UpdateStaffInput | SetActiveInput | ResetPasswordInput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeText(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max && !CONTROL_CHARACTERS.test(value);
}

function parseStaffInput(value: Record<string, unknown>): StaffInput | null {
  const displayName = typeof value.displayName === "string"
    ? value.displayName.trim().normalize("NFC")
    : "";
  const role = value.role;
  const branchCodes = Array.isArray(value.branchCodes)
    ? [...new Set(value.branchCodes.map((code) => String(code).toLowerCase()))]
    : [];

  if (
    !isSafeText(displayName, 2, 100) ||
    typeof role !== "string" ||
    !ALLOWED_ROLES.has(role) ||
    branchCodes.some((code) => !ALLOWED_BRANCH_CODES.has(code)) ||
    (role === "receptionist" && branchCodes.length === 0)
  ) {
    return null;
  }

  return { displayName, role: role as StaffRole, branchCodes };
}

function parsePayload(value: unknown): StaffRequest | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;

  if (value.action === "create") {
    const staff = parseStaffInput(value);
    const loginName = typeof value.loginName === "string"
      ? value.loginName.trim().toLowerCase()
      : "";
    const password = typeof value.password === "string" ? value.password : "";

    if (
      !staff ||
      !LOGIN_NAME_PATTERN.test(loginName) ||
      password.length < 6 ||
      password.length > 72 ||
      CONTROL_CHARACTERS.test(password)
    ) {
      return null;
    }

    return { action: "create", loginName, password, ...staff };
  }

  if (value.action === "update") {
    const staff = parseStaffInput(value);
    const userId = typeof value.userId === "string" ? value.userId : "";
    const loginName = typeof value.loginName === "string"
      ? value.loginName.trim().toLowerCase()
      : "";
    if (!staff || !USER_ID_PATTERN.test(userId) || !LOGIN_NAME_PATTERN.test(loginName)) {
      return null;
    }
    return { action: "update", userId, loginName, ...staff };
  }

  if (value.action === "set-active" || value.action === "set_active") {
    const userId = typeof value.userId === "string" ? value.userId : "";
    if (!USER_ID_PATTERN.test(userId) || typeof value.isActive !== "boolean") {
      return null;
    }
    return { action: "set-active", userId, isActive: value.isActive };
  }

  if (value.action === "reset-password" || value.action === "reset_password") {
    const userId = typeof value.userId === "string" ? value.userId : "";
    const password = typeof value.password === "string" ? value.password : "";
    if (
      !USER_ID_PATTERN.test(userId) ||
      password.length < 6 ||
      password.length > 72 ||
      CONTROL_CHARACTERS.test(password)
    ) {
      return null;
    }
    return { action: "reset-password", userId, password };
  }

  return null;
}

function getLoginName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const storedName = user.user_metadata?.login_name;
  const legacyName = user.email?.split("@")[0];
  return String(storedName ?? legacyName ?? "").trim().toLowerCase();
}

async function findAuthUserByLoginName(
  authAdminClient: SupabaseClient,
  loginName: string,
  exceptUserId?: string,
) {
  const { data, error } = await authAdminClient.auth.admin.listUsers({
    page: 1,
    perPage: MAX_STAFF_ACCOUNTS,
  });
  if (error) throw error;
  return data.users.find(
    (user) => user.id !== exceptUserId && getLoginName(user) === loginName,
  );
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

async function getAdminActor(
  userClient: SupabaseClient,
  accessToken: string,
) {
  const { data: userData, error: userError } = await userClient.auth.getUser(
    accessToken,
  );
  if (userError || !userData.user) {
    console.error(JSON.stringify({ code: "INVALID_USER_SESSION" }));
    return null;
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin" || !profile.is_active) {
    console.error(JSON.stringify({
      code: "ADMIN_PROFILE_REQUIRED",
      userId: userData.user.id,
    }));
    return null;
  }

  return userData.user;
}

async function getBranchIds(
  serviceClient: SupabaseClient,
  branchCodes: string[],
) {
  if (branchCodes.length === 0) return [];

  const { data, error } = await serviceClient
    .from("branches")
    .select("id, code")
    .in("code", branchCodes)
    .eq("is_active", true);

  if (error || data.length !== branchCodes.length) {
    throw new Error("INVALID_BRANCH_ACCESS");
  }

  return data.map((branch) => ({
    id: String(branch.id),
    code: String(branch.code),
  }));
}

async function replaceBranchAccess(
  serviceClient: SupabaseClient,
  userId: string,
  branchIds: string[],
) {
  const { error: deleteError } = await serviceClient
    .from("staff_branch_access")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (branchIds.length === 0) return;

  const { error: insertError } = await serviceClient
    .from("staff_branch_access")
    .insert(branchIds.map((branchId) => ({ user_id: userId, branch_id: branchId })));
  if (insertError) throw insertError;
}

async function recordAuditLog(
  client: SupabaseClient,
  actorId: string,
  action: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await client.from("audit_logs").insert({
      actor_id: actorId,
      action,
      entity_type: "profile",
      entity_id: entityId,
      ...(metadata ? { metadata } : {}),
    });
  } catch (err) {
    console.error("audit_log error:", err);
  }
}

async function listStaff(serviceClient: SupabaseClient, databaseClient: SupabaseClient) {
  const [usersResult, profilesResult, accessResult, branchesResult] = await Promise.all([
    serviceClient.auth.admin.listUsers({ page: 1, perPage: MAX_STAFF_ACCOUNTS }),
    databaseClient.from("profiles").select(
      "user_id, display_name, role, is_active, created_at, updated_at",
    ),
    databaseClient.from("staff_branch_access").select("user_id, branch_id"),
    databaseClient.from("branches").select("id, code, name").eq("is_active", true),
  ]);

  if (
    usersResult.error ||
    profilesResult.error ||
    accessResult.error ||
    branchesResult.error
  ) {
    throw new Error("STAFF_LIST_FAILED");
  }

  const authUsers = new Map(
    usersResult.data.users.map((user) => [user.id, user]),
  );
  const branches = new Map(
    branchesResult.data.map((branch) => [String(branch.id), branch]),
  );
  const accessByUser = new Map<string, Array<{ code: string; name: string }>>();

  for (const access of accessResult.data) {
    const branch = branches.get(String(access.branch_id));
    if (!branch) continue;
    const userAccess = accessByUser.get(String(access.user_id)) ?? [];
    userAccess.push({ code: String(branch.code), name: String(branch.name) });
    accessByUser.set(String(access.user_id), userAccess);
  }

  return profilesResult.data
    .map((profile) => {
      const authUser = authUsers.get(String(profile.user_id));
      return {
        userId: String(profile.user_id),
        loginName: authUser ? getLoginName(authUser) : "",
        displayName: String(profile.display_name),
        role: String(profile.role),
        isActive: Boolean(profile.is_active),
        branches: (accessByUser.get(String(profile.user_id)) ?? [])
          .sort((left, right) => left.code.localeCompare(right.code)),
        createdAt: String(profile.created_at),
        lastSignInAt: authUser?.last_sign_in_at ?? null,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "vi"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCreateStaff(
  serviceClient: SupabaseClient,
  _userClient: SupabaseClient,
  actor: User,
  payload: CreateStaffInput,
  origin: string | null,
): Promise<Response> {
  const branches = await getBranchIds(serviceClient, payload.branchCodes);
  const existingAccount = await findAuthUserByLoginName(
    serviceClient,
    payload.loginName,
  );
  if (existingAccount) {
    return jsonResponse({ success: false, code: "ACCOUNT_EXISTS" }, 409, origin);
  }

  const { data: createdUser, error: createError } =
    await serviceClient.auth.admin.createUser({
      email: `${payload.loginName}@accounts.dym.internal`,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        display_name: payload.displayName,
        login_name: payload.loginName,
      },
    });

  if (createError || !createdUser?.user) {
    const duplicateEmail = createError?.message.toLowerCase().includes("already");
    return jsonResponse(
      { success: false, code: duplicateEmail ? "ACCOUNT_EXISTS" : "CREATE_FAILED" },
      duplicateEmail ? 409 : 400,
      origin,
    );
  }

  const targetUserId = createdUser.user.id;
  try {
    const { error: profileError } = await serviceClient.from("profiles").insert({
      user_id: targetUserId,
      display_name: payload.displayName,
      role: payload.role,
      is_active: true,
    });
    if (profileError) throw profileError;

    await replaceBranchAccess(
      serviceClient,
      targetUserId,
      branches.map((branch) => branch.id),
    );
  } catch (error) {
    await serviceClient.auth.admin.deleteUser(targetUserId);
    throw error;
  }

  await recordAuditLog(serviceClient, actor.id, "staff.created", targetUserId, {
    display_name: payload.displayName,
    role: payload.role,
    branch_codes: payload.branchCodes,
  });

  return jsonResponse({ success: true, userId: targetUserId }, 201, origin);
}

async function handleUpdateStaff(
  serviceClient: SupabaseClient,
  _userClient: SupabaseClient,
  actor: User,
  payload: UpdateStaffInput,
  origin: string | null,
): Promise<Response> {
  if (payload.userId === actor.id && payload.role !== "admin") {
    return jsonResponse({ success: false, code: "SELF_ADMIN_PROTECTION" }, 400, origin);
  }

  const branches = await getBranchIds(serviceClient, payload.branchCodes);
  const duplicateAccount = await findAuthUserByLoginName(
    serviceClient,
    payload.loginName,
    payload.userId,
  );
  if (duplicateAccount) {
    return jsonResponse({ success: false, code: "ACCOUNT_EXISTS" }, 409, origin);
  }

  const { data: targetAuthData, error: targetAuthError } =
    await serviceClient.auth.admin.getUserById(payload.userId);
  if (targetAuthError || !targetAuthData.user) {
    return jsonResponse({ success: false, code: "STAFF_NOT_FOUND" }, 404, origin);
  }

  const { data: oldProfile, error: oldProfileError } = await serviceClient
    .from("profiles")
    .select("display_name, role, is_active")
    .eq("user_id", payload.userId)
    .maybeSingle();
  const { data: oldAccess, error: oldAccessError } = await serviceClient
    .from("staff_branch_access")
    .select("branch_id")
    .eq("user_id", payload.userId);

  if (oldProfileError || oldAccessError || !oldProfile) {
    return jsonResponse({ success: false, code: "STAFF_NOT_FOUND" }, 404, origin);
  }

  const { error: profileError } = await serviceClient
    .from("profiles")
    .update({ display_name: payload.displayName, role: payload.role })
    .eq("user_id", payload.userId);
  if (profileError) throw profileError;

  try {
    await replaceBranchAccess(
      serviceClient,
      payload.userId,
      branches.map((branch) => branch.id),
    );
  } catch (error) {
    await serviceClient.from("profiles").update({
      display_name: oldProfile.display_name,
      role: oldProfile.role,
    }).eq("user_id", payload.userId);
    await replaceBranchAccess(
      serviceClient,
      payload.userId,
      oldAccess.map((access) => String(access.branch_id)),
    );
    throw error;
  }

  const { error: authMetadataError } = await serviceClient.auth.admin.updateUserById(
    payload.userId,
    {
      user_metadata: {
        ...targetAuthData.user.user_metadata,
        display_name: payload.displayName,
        login_name: payload.loginName,
      },
    },
  );
  if (authMetadataError) throw authMetadataError;

  await recordAuditLog(serviceClient, actor.id, "staff.updated", payload.userId, {
    display_name: payload.displayName,
    login_name: payload.loginName,
    role: payload.role,
    branch_codes: payload.branchCodes,
  });

  return jsonResponse({ success: true }, 200, origin);
}

async function handleSetActive(
  serviceClient: SupabaseClient,
  _userClient: SupabaseClient,
  actor: User,
  payload: SetActiveInput,
  origin: string | null,
): Promise<Response> {
  if (payload.userId === actor.id && !payload.isActive) {
    return jsonResponse({ success: false, code: "SELF_ADMIN_PROTECTION" }, 400, origin);
  }

  const { data: targetProfile } = await serviceClient
    .from("profiles")
    .select("is_active")
    .eq("user_id", payload.userId)
    .maybeSingle();
  if (!targetProfile) {
    return jsonResponse({ success: false, code: "STAFF_NOT_FOUND" }, 404, origin);
  }

  const banDuration = payload.isActive ? "none" : "876000h";
  const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(
    payload.userId,
    { ban_duration: banDuration },
  );
  if (authUpdateError) throw authUpdateError;

  const { error: profileUpdateError } = await serviceClient
    .from("profiles")
    .update({ is_active: payload.isActive })
    .eq("user_id", payload.userId);
  if (profileUpdateError) {
    await serviceClient.auth.admin.updateUserById(payload.userId, {
      ban_duration: targetProfile.is_active ? "none" : "876000h",
    });
    throw profileUpdateError;
  }

  await recordAuditLog(
    serviceClient,
    actor.id,
    payload.isActive ? "staff.unlocked" : "staff.locked",
    payload.userId,
  );

  return jsonResponse({ success: true }, 200, origin);
}

async function handleResetPassword(
  serviceClient: SupabaseClient,
  _userClient: SupabaseClient,
  actor: User,
  payload: ResetPasswordInput,
  origin: string | null,
): Promise<Response> {
  const { data: targetProfile } = await serviceClient
    .from("profiles")
    .select("user_id")
    .eq("user_id", payload.userId)
    .maybeSingle();
  if (!targetProfile) {
    return jsonResponse({ success: false, code: "STAFF_NOT_FOUND" }, 404, origin);
  }

  const { error: passwordError } = await serviceClient.auth.admin.updateUserById(
    payload.userId,
    { password: payload.password },
  );
  if (passwordError) throw passwordError;

  await recordAuditLog(serviceClient, actor.id, "staff.password_reset", payload.userId);

  return jsonResponse({ success: true }, 200, origin);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ success: false, code: "ORIGIN_NOT_ALLOWED" }, 403, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(
      { success: false, code: "METHOD_NOT_ALLOWED" },
      405,
      origin,
      { Allow: "GET, POST, OPTIONS" },
    );
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonResponse({ success: false, code: "AUTH_REQUIRED" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseSecretKey = getSupabaseSecretKey();
  const supabasePublishableKey = getSupabasePublishableKey();
  if (!supabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
    console.error(JSON.stringify({ requestId, code: "SERVER_NOT_CONFIGURED" }));
    return jsonResponse({ success: false, code: "SERVER_ERROR" }, 500, origin);
  }

  const userClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const serviceClient = createAdminClient(supabaseUrl, supabaseSecretKey);

  const actor = await getAdminActor(userClient, accessToken);
  if (!actor) {
    return jsonResponse({ success: false, code: "ADMIN_REQUIRED" }, 403, origin);
  }

  try {
    if (request.method === "GET") {
      return jsonResponse(
        { success: true, staff: await listStaff(serviceClient, userClient) },
        200,
        origin,
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413, origin);
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413, origin);
    }

    let decodedBody: unknown;
    try {
      decodedBody = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ success: false, code: "INVALID_DATA" }, 400, origin);
    }

    const payload = parsePayload(decodedBody);
    if (!payload) {
      return jsonResponse({ success: false, code: "INVALID_DATA" }, 400, origin);
    }

    switch (payload.action) {
      case "create":
        return await handleCreateStaff(serviceClient, userClient, actor, payload, origin);
      case "update":
        return await handleUpdateStaff(serviceClient, userClient, actor, payload, origin);
      case "set-active":
        return await handleSetActive(serviceClient, userClient, actor, payload, origin);
      case "reset-password":
        return await handleResetPassword(serviceClient, userClient, actor, payload, origin);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      requestId,
      code: "MANAGE_STAFF_FAILED",
      message: errorMessage,
    }));
    return jsonResponse(
      { success: false, code: "SERVER_ERROR", message: errorMessage, requestId },
      500,
      origin,
    );
  }
});
