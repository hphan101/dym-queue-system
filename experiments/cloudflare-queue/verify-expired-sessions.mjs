import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { purgeExpiredPreviewSessions } from './expired-sessions.mjs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const now = 86_400_000 * 40;
const cutoff = now - 86_400_000;
const oldestNetwork = now - 30 * 86_400_000;
sqlite.exec(`
  insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at)
  values ('kept', 'q1', '2026-11-24', 1, 'DEMO-CLEANUP', ${cutoff - 1});
  insert into preview_registration_edits (registration_id, details) values ('kept', '{"fullName":"Khách thử cron"}');
  insert into preview_print_status values ('kept', 1, 1);
  update registrations set called_at = ${cutoff} where id = 'kept';
  insert into preview_registration_sessions values ('old', 'q1', ${cutoff - 1}), ('recent', 'q1', ${cutoff}), ('active', 'hn', ${now + 1});
  insert into preview_registration_submissions (token_hash, registration_id) values ('old', 'kept');
  insert into preview_staff_accounts (id, login_name, display_name, role, branches, permissions, password_hash, password_salt, created_at)
  values ('staff', 'demo-cron', 'Nhân viên thử cron', 'receptionist', '["hn"]', '{}', 'test', 'test', ${cutoff - 1});
  insert into preview_staff_sessions values ('expired', ${now}), ('active', ${now + 1});
  insert into preview_managed_staff_sessions values ('expired', 'staff', 0, ${now}), ('active', 'staff', 0, ${now + 1});
  insert into preview_staff_login_limits values ('old', ${cutoff / 300_000 - 1}, 40), ('recent', ${cutoff / 300_000}, 40), ('active', ${now / 300_000}, 2);
  insert into preview_registration_ip_limits values ('old', ${oldestNetwork - 1}, 1), ('recent', ${oldestNetwork}, 1);
`);
const preserveTables = ['registrations', 'preview_registration_edits', 'preview_print_status', 'display_state', 'preview_staff_accounts'];
const preserved = () => preserveTables.map(table => sqlite.prepare('select * from ' + table + ' order by 1').all());
const before = preserved();
const db = {
  prepare: sql => ({ bind: value => () => sqlite.prepare(sql).run(value) }),
  batch(statements) {
    sqlite.exec('begin');
    try {
      const writes = statements.map(run => run().changes);
      sqlite.exec('commit');
      return writes;
    } catch (error) {
      sqlite.exec('rollback');
      throw error;
    }
  },
};

assert.deepEqual(await purgeExpiredPreviewSessions(db, now), [1, 1, 1, 1, 1, 1]);
const tokens = table => sqlite.prepare('select token_hash from ' + table + ' order by token_hash').all().map(row => row.token_hash);
assert.deepEqual(tokens('preview_registration_sessions'), ['active', 'recent']);
assert.deepEqual(tokens('preview_staff_sessions'), ['active']);
assert.deepEqual(tokens('preview_managed_staff_sessions'), ['active']);
assert.deepEqual(sqlite.prepare('select key from preview_staff_login_limits order by 1').all().map(row => row.key), ['active', 'recent']);
assert.deepEqual(sqlite.prepare('select fingerprint from preview_registration_ip_limits').all().map(row => row.fingerprint), ['recent']);
assert.deepEqual(preserved(), before);
assert.deepEqual(sqlite.prepare('pragma foreign_key_check').all(), []);
assert.deepEqual(await purgeExpiredPreviewSessions(db, now), [0, 0, 0, 0, 0, 0]);
console.log('PASS repeatable session cleanup preserves active sessions, registration data, print state, staff and TV state');
