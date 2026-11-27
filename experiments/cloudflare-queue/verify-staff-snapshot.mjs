import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { getDefaultPermissions } from '../../supabase/functions/_shared/staffPermissions.ts';
import { branchAllowed, loadStaffSession, loginStaff, managePreviewStaff, staffCan } from './staff.mjs';
import { loadStaffSnapshot } from './staff-snapshot.mjs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) {
      return {
        first: () => statement.get(...values),
        run: () => ({ meta: statement.run(...values) }),
      };
    } };
  },
  batch(statements) {
    sqlite.exec('begin');
    try {
      const results = statements.map(statement => statement.run());
      sqlite.exec('commit');
      return results;
    } catch (error) {
      sqlite.exec('rollback');
      throw error;
    }
  },
};
const now = Date.parse('2026-11-25T08:00:00Z');
const created = '2026-10-01T02:12:00Z';
const lastSignedIn = '2026-11-24T09:00:00Z';
const limited = getDefaultPermissions('none');
limited.reception.view = true;
const usernames = ['admin-test', 'desk-test', 'locked-test', 'banned-test', 'unconfirmed-test', 'custom-admin-test'];
const profiles = usernames.map((loginName, index) => ({
  user_id: randomUUID(),
  display_name: 'Tài khoản thử ' + (index + 1),
  role: [0, 5].includes(index) ? 'admin' : 'receptionist',
  permissions: [1, 5].includes(index) ? limited : null,
  is_active: index !== 2,
  can_edit_roster_history: index === 0,
  created_at: created,
}));
const authUsers = profiles.map(({ user_id }, index) => ({
  id: user_id, email: usernames[index] + '@accounts.dym.internal',
  email_confirmed_at: index === 4 ? null : created,
  banned_until: index === 3 ? '2027-01-01T00:00:00Z' : null,
  last_sign_in_at: index === 0 ? lastSignedIn : null,
}));
const branches = ['q1', 'q7', 'hn', 'closed-test'].map(code => ({ id: randomUUID(), code, is_active: code !== 'closed-test' }));
const access = profiles.slice(1).map(profile => ({ user_id: profile.user_id, branch_id: branches[1].id }));
access.push({ user_id: profiles[1].user_id, branch_id: branches[3].id });
const snapshot = { branches, profiles, staff_branch_access: access, auth_users: authUsers };
const countAccounts = () => sqlite.prepare('select count(*) as n from preview_staff_accounts').get().n;
assert.throws(() => loadStaffSnapshot(sqlite, { ...snapshot, auth_users: authUsers.slice(0, -1) }, now), /missing its Auth user/);
assert.equal(countAccounts(), 0);
assert.throws(() => loadStaffSnapshot(sqlite, { ...snapshot,
  auth_users: [...authUsers.slice(0, -1), { ...authUsers.at(-1), email: authUsers[0].email }],
}, now), /UNIQUE constraint/);
assert.equal(countAccounts(), 0);
assert.throws(() => loadStaffSnapshot(sqlite, { ...snapshot,
  staff_branch_access: [...access, { user_id: profiles[0].user_id, branch_id: randomUUID() }],
}, now), /dangling branch assignment/);
assert.deepEqual(loadStaffSnapshot(sqlite, snapshot, now), { accounts: 6, inactive: 3 });
assert.throws(() => loadStaffSnapshot(sqlite, snapshot, now), /fresh rehearsal database/);

function storedAccount(index) {
  return sqlite.prepare('select * from preview_staff_accounts where id = ?').get(profiles[index].user_id);
}
assert.deepEqual(JSON.parse(storedAccount(0).branches), ['q1', 'q7', 'hn']);
assert.equal(storedAccount(0).created_at, Date.parse(created));
assert.equal(storedAccount(0).last_sign_in, Date.parse(lastSignedIn));
assert.deepEqual(JSON.parse(storedAccount(1).branches), ['q7']);
assert.equal(storedAccount(1).can_edit_history, 0);
assert.deepEqual(JSON.parse(storedAccount(5).branches), ['q7']);
assert.equal(sqlite.prepare('select count(distinct password_hash) as n from preview_staff_accounts').get().n, profiles.length);
assert.equal(sqlite.prepare('select count(*) as n from preview_managed_staff_sessions').get().n, 0);

const initialPassword = 'Test-only-' + randomUUID();
const login = (index, password, token) => loginStaff(db, new Request('http://localhost/login'),
  { loginName: usernames[index], password }, token, now, 3_600_000, '', (left, right) => left === right);
assert.equal(await login(0, initialPassword, 'prior-password'), 'INVALID_CREDENTIALS');
const bootstrapToken = randomUUID();
sqlite.prepare('insert into preview_staff_sessions values (?, ?)').run(bootstrapToken, now + 3_600_000);
const admin = await loadStaffSession(db, bootstrapToken, now);
for (const [index, profile] of profiles.entries()) {
  const reset = await managePreviewStaff(new Request('http://localhost/manage-staff', {
    method: 'POST',
    body: JSON.stringify({ action: 'reset-password', userId: profile.user_id, password: initialPassword }),
  }), db, admin, now);
  assert.equal(reset.status, 200);
  const token = randomUUID();
  if ([2, 3, 4].includes(index)) {
    assert.equal(await login(index, initialPassword, token), 'INVALID_CREDENTIALS');
    assert.equal(await loadStaffSession(db, token, now), null);
    continue;
  }
  assert.equal(await login(index, initialPassword, token), null);
  const staff = await loadStaffSession(db, token, now);
  assert.equal(staff.id, profile.user_id);
  assert.equal(staff.loginName, usernames[index]);
  assert.equal(staff.canEditHistory, index === 0);
  assert.equal(branchAllowed(staff, 'q1'), index === 0);
  assert.equal(branchAllowed(staff, 'q7'), true);
  assert.equal(branchAllowed(staff, 'hn'), index === 0);
  assert.equal(staffCan(staff, 'reception'), true);
  assert.equal(staffCan(staff, 'reception', 'update'), index === 0);
  assert.equal(staffCan(staff, 'staff', 'update'), index === 0);
}
console.log('PASS staff snapshot import, exact branch and module access, locked accounts and first password provisioning');
