import { BRANCH_NAMES } from '../../frontend/src/config/branches.ts';
import { getDefaultPermissions, hasPermission, parsePermissions, PERMISSION_MODULES } from '../../supabase/functions/_shared/staffPermissions.ts';
import { createRegistrationSessionToken, hashRegistrationSession } from '../../supabase/functions/_shared/registrationAccess.ts';
import { isSafeText, LOGIN_NAME_PATTERN } from '../../supabase/functions/_shared/http.ts';
import { testText } from './preview-data.mjs';

export const previewBranches = Object.keys(BRANCH_NAMES);
export const STAFF_LOGIN_BUCKET_MS = 5 * 60_000;
const adminId = 'preview-staff';
const roles = ['admin', 'operator', 'receptionist'];
const managedLogin = /^demo[-_.][a-z0-9][a-z0-9._-]{0,26}$/;
const adminPermissions = getDefaultPermissions('admin');
adminPermissions.registrations.delete = false;
const demoAdmin = {
  id: adminId, loginName: 'demo', displayName: 'Nhân viên thử nghiệm', role: 'admin',
  permissions: adminPermissions, branches: previewBranches, canEditHistory: false, isActive: true, createdAt: 0, lastSignIn: null,
};
export const staffCan = (staff, module, action = 'view') => Boolean(staff && hasPermission(staff.role, staff.permissions, module, action));
export const branchAllowed = (staff, branch) => staff?.branches.includes(branch) === true;
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code, status) => response({ success: false, code }, status);
export const validPassword = password => typeof password === 'string' && password.length >= 6
  && password.length <= 72 && !/[\x00-\x1f\x7f]/.test(password);

function account(row) {
  return {
    id: row.id, loginName: row.login_name, displayName: row.display_name, role: row.role,
    permissions: JSON.parse(row.permissions), branches: JSON.parse(row.branches), canEditHistory: Boolean(row.can_edit_history),
    isActive: Boolean(row.is_active), createdAt: row.created_at, lastSignIn: row.last_sign_in,
  };
}

function serialize(staff) {
  return {
    userId: staff.id, loginName: staff.loginName, displayName: staff.displayName, role: staff.role,
    permissions: staff.permissions, isActive: staff.isActive, canEditRosterHistory: staff.canEditHistory,
    branches: staff.branches.map(code => ({ code, name: BRANCH_NAMES[code] })),
    createdAt: staff.createdAt ? new Date(staff.createdAt).toISOString() : '',
    lastSignInAt: staff.lastSignIn === null ? null : new Date(staff.lastSignIn).toISOString(),
  };
}

export async function passwordHash(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export async function loadStaffSession(db, hash, now, allowDemo = true) {
  const row = await db.prepare(
    'select a.* from preview_managed_staff_sessions s join preview_staff_accounts a on a.id = s.user_id ' +
    'where s.token_hash = ? and s.expires_at > ? and a.is_active = 1 and a.session_version = s.session_version',
  ).bind(hash, now).first();
  if (row) return account(row);
  if (!allowDemo) return null;
  const bootstrap = await db.prepare('select 1 from preview_staff_sessions where token_hash = ? and expires_at > ?')
    .bind(hash, now).first();
  return bootstrap ? demoAdmin : null;
}

export async function loginStaff(db, request, body, hash, now, duration, bootstrapPassword, equalSecret) {
  const login = typeof body?.loginName === 'string' ? body.loginName.trim().toLowerCase() : '';
  if (!LOGIN_NAME_PATTERN.test(login) || !validPassword(body?.password)) return 'INVALID_CREDENTIALS';
  const key = await hashRegistrationSession('preview-login|' + (request.headers.get('CF-Connecting-IP') ?? 'local'));
  const bucket = Math.floor(now / STAFF_LOGIN_BUCKET_MS);
  const limits = await db.prepare(
    'insert into preview_staff_login_limits values (?, ?, 1) on conflict(key) do update set ' +
    'attempts = case when bucket = excluded.bucket then min(attempts + 1, 41) else 1 end, ' +
    'bucket = excluded.bucket where bucket <= excluded.bucket returning attempts',
  ).bind(key, bucket).first();
  if (!limits || limits.attempts > 40) return 'RATE_LIMITED';
  if (login === 'demo') {
    if (!equalSecret(body.password, bootstrapPassword)) return 'INVALID_CREDENTIALS';
    await db.prepare('insert into preview_staff_sessions values (?, ?)').bind(hash, now + duration).run();
    return null;
  }
  const row = await db.prepare('select id, password_hash, password_salt, session_version, is_active from preview_staff_accounts where login_name = ?')
    .bind(login).first();
  const digest = await passwordHash(body.password, row?.password_salt ?? 'preview-unused-password-salt');
  if (!row?.is_active || !equalSecret(digest, row.password_hash)) return 'INVALID_CREDENTIALS';
  const [session] = await db.batch([
    db.prepare('insert into preview_managed_staff_sessions select ?, id, session_version, ? from preview_staff_accounts ' +
      'where id = ? and is_active = 1 and session_version = ?').bind(hash, now + duration, row.id, row.session_version),
    db.prepare('update preview_staff_accounts set last_sign_in = ? where id = ? and is_active = 1 and session_version = ?')
      .bind(now, row.id, row.session_version),
  ]);
  return session.meta.changes ? null : 'INVALID_CREDENTIALS';
}

function canManage(actor, target) {
  if (actor.id === adminId) return true;
  return target.branches.every(branch => branchAllowed(actor, branch))
    && (!target.canEditHistory || actor.canEditHistory)
    && PERMISSION_MODULES.every(({ key, actions }) =>
      actions.every(action => !staffCan(target, key, action) || staffCan(actor, key, action)));
}

function parseStaff(body, preview) {
  const permissions = parsePermissions(body.permissions);
  const branches = Array.isArray(body.branchCodes) ? [...new Set(body.branchCodes)] : [];
  const loginName = typeof body.loginName === 'string' ? body.loginName.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().normalize('NFC') : '';
  if (!LOGIN_NAME_PATTERN.test(loginName) || loginName === 'demo' || !isSafeText(displayName, 2, 100)
    || (preview && (!managedLogin.test(loginName) || !testText(displayName)))
    || !roles.includes(body.role) || !branches.length || branches.some(branch => !previewBranches.includes(branch))
    || !permissions || typeof body.canEditRosterHistory !== 'boolean') return null;
  return { loginName, displayName, role: body.role, branches, permissions, canEditHistory: body.canEditRosterHistory };
}

export async function managePreviewStaff(request, db, actor, now, preview = true) {
  if (!actor) return fail('AUTH_REQUIRED', 401);
  if (!staffCan(actor, 'staff')) return fail('ADMIN_REQUIRED', 403);
  if (request.method === 'GET') {
    const { results } = await db.prepare('select * from preview_staff_accounts order by created_at, login_name').all();
    const staff = results.map(account).filter(target => target.id === actor.id || canManage(actor, target));
    if (actor.id === adminId) staff.unshift(demoAdmin);
    return response({ success: true, permissionSchemaVersion: 1, staff: staff.map(serialize) });
  }
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
  if (Number(request.headers.get('Content-Length')) > 8192) return fail('INVALID_DATA', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) return fail('INVALID_DATA', 413);
  let body;
  try { body = JSON.parse(raw); } catch { return fail('INVALID_DATA', 400); }
  if (!body || !['create', 'update', 'set-active', 'reset-password', 'delete'].includes(body.action)) return fail('INVALID_DATA', 400);
  const action = body.action === 'create' || body.action === 'delete' ? body.action : 'update';
  if (!staffCan(actor, 'staff', action)) return fail('ADMIN_REQUIRED', 403);
  if (body.userId === adminId) return fail('SELF_ADMIN_PROTECTION', 403);

  const input = ['create', 'update'].includes(body.action) ? parseStaff(body, preview) : null;
  if (['create', 'update'].includes(body.action) && !input) return fail(preview ? 'PREVIEW_STAFF_DATA_REQUIRED' : 'INVALID_DATA', 400);
  if (body.userId === actor.id && (preview || body.action !== 'update' || !staffCan(input, 'staff', 'update'))) {
    return fail('SELF_ADMIN_PROTECTION', 403);
  }
  if (input && !canManage(actor, input)) return fail('ADMIN_REQUIRED', 403);
  if (['create', 'reset-password'].includes(body.action) && !validPassword(body.password)) return fail('INVALID_DATA', 400);
  if (body.action === 'set-active' && typeof body.isActive !== 'boolean') return fail('INVALID_DATA', 400);
  if (body.action !== 'create' && typeof body.userId !== 'string') return fail('INVALID_DATA', 400);
  const current = body.action === 'create' ? null : await db.prepare('select * from preview_staff_accounts where id = ?').bind(body.userId).first();
  if (body.action !== 'create' && !current) return fail('STAFF_NOT_FOUND', 404);
  if (current && !canManage(actor, account(current))) return fail('ADMIN_REQUIRED', 403);
  if (body.action === 'set-active' && current.is_active === Number(body.isActive)) return response({ success: true });

  const salt = ['create', 'reset-password'].includes(body.action) ? createRegistrationSessionToken() : null;
  const hash = salt ? await passwordHash(body.password, salt) : null;
  const values = input ? [input.loginName, input.displayName, input.role, JSON.stringify(input.branches),
    JSON.stringify(input.permissions), Number(input.canEditHistory)] : [];
  const id = current?.id ?? crypto.randomUUID();
  const target = 'where id = ? and role = ? and branches = ? and permissions = ? and can_edit_history = ? and session_version = ?';
  const expected = current && [id, current.role, current.branches, current.permissions, current.can_edit_history, current.session_version];
  try {
    let mutation;
    let auditAction;
    if (body.action === 'create') {
      mutation = db.prepare('insert into preview_staff_accounts (id, login_name, display_name, role, branches, permissions, can_edit_history, created_at, password_hash, password_salt) ' +
        'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ...values, now, hash, salt);
      auditAction = 'staff.created';
    } else if (body.action === 'update') {
      mutation = db.prepare('update preview_staff_accounts set login_name = ?, display_name = ?, role = ?, branches = ?, permissions = ?, can_edit_history = ? ' + target)
        .bind(...values, ...expected);
      auditAction = 'staff.updated';
    } else if (body.action === 'set-active') {
      mutation = db.prepare('update preview_staff_accounts set is_active = ?, session_version = session_version + 1 ' + target)
        .bind(Number(body.isActive), ...expected);
      auditAction = body.isActive ? 'staff.unlocked' : 'staff.locked';
    } else if (body.action === 'reset-password') {
      mutation = db.prepare('update preview_staff_accounts set password_hash = ?, password_salt = ?, session_version = session_version + 1 ' + target)
        .bind(hash, salt, ...expected);
      auditAction = 'staff.password_reset';
    } else {
      mutation = db.prepare('delete from preview_staff_accounts ' + target).bind(...expected);
      auditAction = 'staff.deleted';
    }
    const metadata = input ? {
      login_name: input.loginName, role: input.role, branch_codes: input.branches,
      can_edit_roster_history: input.canEditHistory, permissions: input.permissions,
    } : {};
    const [saved] = await db.batch([
      mutation,
      db.prepare("insert into audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at) " +
        "select ?, ?, 'profile', ?, ?, ? where changes() = 1").bind(actor.id, auditAction, id, JSON.stringify(metadata), now),
    ]);
    if (!saved.meta.changes) return fail('STAFF_CHANGED', 409);
  } catch (error) {
    if (String(error).includes('preview_staff_accounts.login_name')) return fail('ACCOUNT_EXISTS', 409);
    console.error('Staff operation failed');
    return fail('SERVER_ERROR', 500);
  }
  return response({ success: true, permissionSchemaVersion: 1, ...(body.action === 'create' ? { userId: id } : {}) }, body.action === 'create' ? 201 : 200);
}
