import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRegistrationSessionToken } from '../../supabase/functions/_shared/registrationAccess.ts';
import { hasPermission } from '../../supabase/functions/_shared/staffPermissions.ts';
import { guardEmptyImport, prepareSnapshotRows } from './import-d1.mjs';
import { loadReceptionSnapshot } from './reception-snapshot.mjs';
import { prepareRosterSnapshot, rosterSnapshotTables } from './roster-snapshot.mjs';
import { loadStaffSnapshot } from './staff-snapshot.mjs';
import { passwordHash, validPassword } from './staff.mjs';

// Counters precede registrations so the insert trigger preserves source high-water marks.
const sqliteTables = [
  'preview_staff_accounts', 'daily_queue_counters', 'registrations', 'preview_registration_edits',
  'preview_print_status', 'display_state', 'queue_calls', 'audit_logs',
  'preview_registration_sessions', 'preview_registration_submissions',
];
const allTables = [...sqliteTables, ...rosterSnapshotTables,
  'preview_staff_sessions', 'preview_managed_staff_sessions', 'preview_staff_login_limits', 'preview_registration_ip_limits'];

export function sourceSnapshotQuery() {
  const projections = ['reception', 'staff', 'roster'].map(name => {
    const sql = readFileSync(new URL(`./${name}-snapshot.sql`, import.meta.url), 'utf8').trim().replace(/;$/, '');
    return `'${name}', (\n${sql}\n)`;
  });
  return `select jsonb_build_object(\n${projections.join(',\n')}\n);\n`;
}

function branchKeys(rows) {
  return rows.map(row => JSON.stringify([row.id, row.code, row.is_active])).sort().join('\n');
}

async function provisionInitialAdmin(sqlite, staffSnapshot, { loginName, password } = {}) {
  if (typeof loginName !== 'string' || !validPassword(password)) throw new Error('Provide initial administrator credentials.');
  const admin = sqlite.prepare('select * from preview_staff_accounts where login_name = ?').get(loginName.trim().toLowerCase());
  const activeBranches = staffSnapshot.branches.filter(row => row.is_active).map(row => row.code);
  const branches = admin ? JSON.parse(admin.branches) : [];
  const grants = admin ? JSON.parse(admin.permissions) : null;
  if (admin?.role !== 'admin' || !admin.is_active
    || !hasPermission(admin.role, grants, 'staff', 'update') || !hasPermission(admin.role, grants, 'staff', 'create')
    || !activeBranches.every(code => branches.includes(code))) {
    throw new Error('The initial administrator must already manage staff at all active branches.');
  }
  const salt = createRegistrationSessionToken();
  sqlite.prepare('update preview_staff_accounts set password_hash = ?, password_salt = ? where id = ?')
    .run(await passwordHash(password, salt), salt, admin.id);
}

export async function loadDymSnapshot(env, snapshot, readSourceObject, initialAdmin, now = Date.now()) {
  const { DB } = env;
  const { reception, staff, roster } = snapshot ?? {};
  if (!roster || !Array.isArray(reception?.branches) || !Array.isArray(staff?.branches)
    || branchKeys(reception.branches) !== branchKeys(staff.branches)) {
    throw new Error('The reception and staff snapshots must use the same source branches.');
  }
  const gate = await guardEmptyImport(DB, allTables);
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    const receptionCounts = loadReceptionSnapshot(sqlite, reception);
    const staffCounts = loadStaffSnapshot(sqlite, staff, now);
    await provisionInitialAdmin(sqlite, staff, initialAdmin);
    const statements = sqliteTables.flatMap(table => {
      const columns = sqlite.prepare(`pragma table_info(${table})`).all().map(row => row.name);
      const rows = sqlite.prepare(`select * from ${table}`).iterate();
      return prepareSnapshotRows(DB, table, columns, rows);
    });
    const preparedRoster = await prepareRosterSnapshot(env, roster, readSourceObject);
    await DB.batch([gate, ...statements, ...preparedRoster.statements]);
    return { reception: receptionCounts, staff: staffCounts, roster: preparedRoster.counts };
  } finally {
    sqlite.close();
  }
}
