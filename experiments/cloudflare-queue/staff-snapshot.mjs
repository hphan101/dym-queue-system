import { randomBytes } from 'node:crypto';
import { LOGIN_NAME_PATTERN } from '../../supabase/functions/_shared/http.ts';
import { getDefaultPermissions, parsePermissions } from '../../supabase/functions/_shared/staffPermissions.ts';
import { previewBranches } from './staff.mjs';

// Accept a consistent offline snapshot containing only staff profile and Auth metadata.
export function loadStaffSnapshot(db, snapshot, now = Date.now()) {
  const { branches, profiles, staff_branch_access: access, auth_users: authUsers } = snapshot;
  if (![branches, profiles, access, authUsers].every(Array.isArray)) {
    throw new Error('The staff snapshot is missing one or more tables.');
  }
  const branchCodes = new Map(branches.map(({ id, code, is_active }) => [id, is_active ? code : null]));
  const activeBranches = [...branchCodes.values()].filter(code => code !== null);
  if (branches.some(branch => typeof branch.is_active !== 'boolean') || branchCodes.size !== branches.length
    || activeBranches.length !== new Set(activeBranches).size
    || activeBranches.some(code => !previewBranches.includes(code))) {
    throw new Error('The staff snapshot contains duplicate or unsupported branches.');
  }

  const users = new Map(authUsers.map(user => [user.id, user]));
  const assignments = new Map(profiles.map(({ user_id }) => [user_id, new Set()]));
  if (users.size !== authUsers.length || assignments.size !== profiles.length) {
    throw new Error('The staff snapshot contains duplicate users.');
  }
  for (const { user_id, branch_id } of access) {
    const assigned = assignments.get(user_id);
    if (!assigned || !branchCodes.has(branch_id)) throw new Error('The staff snapshot contains a dangling branch assignment.');
    const code = branchCodes.get(branch_id);
    if (code !== null) assigned.add(code);
  }

  const timestamp = value => {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!Number.isFinite(parsed)) throw new Error('The staff snapshot contains an invalid timestamp.');
    return parsed;
  };

  db.exec('begin immediate');
  try {
    if (db.prepare('select exists(select 1 from preview_staff_accounts) as occupied').get().occupied) {
      throw new Error('Use a fresh rehearsal database for the staff snapshot.');
    }
    const insert = db.prepare(`
      insert into preview_staff_accounts (
        id, login_name, display_name, role, branches, permissions, can_edit_history, is_active,
        password_hash, password_salt, created_at, last_sign_in
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inactive = 0;
    for (const profile of profiles) {
      const user = users.get(profile.user_id);
      if (!user) throw new Error('A source profile is missing its Auth user.');
      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      const login = email.endsWith('@accounts.dym.internal') ? email.split('@')[0] : '';
      if (!LOGIN_NAME_PATTERN.test(login) || login === 'demo' || email !== login + '@accounts.dym.internal') {
        throw new Error('A source account is missing a usable DYM login name or uses a reserved name.');
      }
      const permissions = profile.permissions === null
        ? getDefaultPermissions(profile.role) : parsePermissions(profile.permissions);
      if (!permissions || !['admin', 'operator', 'receptionist'].includes(profile.role)
        || typeof profile.is_active !== 'boolean' || typeof profile.can_edit_roster_history !== 'boolean') {
        throw new Error('A source account has invalid permissions or status.');
      }
      const allowed = profile.permissions === null && profile.role === 'admin'
        ? activeBranches : [...assignments.get(profile.user_id)];
      const banned = user.banned_until !== null && timestamp(user.banned_until) > now;
      const enabled = profile.is_active && !banned && user.email_confirmed_at !== null;
      if (user.email_confirmed_at !== null) timestamp(user.email_confirmed_at);
      if (!enabled) inactive++;
      // A random digest has no issued password. An administrator must provision one after import.
      insert.run(profile.user_id, login, profile.display_name, profile.role, JSON.stringify(allowed),
        JSON.stringify(permissions), Number(profile.can_edit_roster_history), Number(enabled),
        randomBytes(32).toString('base64'), randomBytes(32).toString('base64url'),
        timestamp(profile.created_at), user.last_sign_in_at === null ? null : timestamp(user.last_sign_in_at));
    }
    db.exec('commit');
    return { accounts: profiles.length, inactive };
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
