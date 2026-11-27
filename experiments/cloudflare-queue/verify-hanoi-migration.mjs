import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('./schema.sql')
  .replace(/,\r?\n  request_hash text check[^\r\n]+/, '')
  .replace(/^  (?:state text not null default 'active'[^\r\n]+|last_called_at integer,|first_called_by text,|queue_actor_id text,)\r?\n/gm, '')
  .replace("where state = 'active' and called_at is null", 'where called_at is null')
  .replace(/create table if not exists daily_queue_counters[\s\S]+?(?=create table if not exists display_state)/, '')
  .replace(/create table if not exists queue_calls[\s\S]+?(?=create trigger if not exists clear_returned_registration)/, '')
  .replace(/  insert into audit_logs[\s\S]+?(?=  update display_state set registration_id = null)/, '');
const migration = read('./migrations/0001_add_hanoi_reception.sql');
const legacy = schema.replaceAll("check (branch in ('q1', 'q7', 'hn'))", "check (branch in ('q1', 'q7'))");
db.exec(legacy);
db.exec(read('./preview-seed.sql'));
db.exec([
  "insert into registrations values ('q1-001', 'q1', '2026-11-24', 1, 'DEMO-A', 1000, null), ('q7-001', 'q7', '2026-11-24', 1, 'DEMO-B', 2000, null)",
  "insert into preview_registration_sessions values ('q1-session', 'q1', 100000), ('q7-session', 'q7', 100000)",
  "insert into preview_registration_submissions values ('q1-session', 'q1-001'), ('q7-session', 'q7-001')",
  "insert into preview_registration_edits (registration_id, details) values ('q1-001', '{\"fullName\":\"Khách thử A\",\"receptionNote\":\"Ghi chú thử\"}'), ('q7-001', '{\"workplace\":\"Công ty thử\"}')",
  "insert into preview_print_status values ('q1-001', 1, 0), ('q7-001', 0, 1)",
  "update registrations set called_at = 3000 where id = 'q1-001'",
  "update display_state set called_at = 4000, revision = 2 where branch = 'q1'",
].join(';\n'));

const tables = ['registrations', 'display_state', 'preview_registration_sessions', 'preview_registration_submissions',
  'preview_print_status', 'preview_registration_edits', 'preview_roster_samples', 'preview_roster_revision'];
const snapshot = () => tables.map(table => db.prepare('select * from ' + table + ' order by 1').all());
const before = snapshot();
assert.throws(() => db.exec("insert into preview_registration_sessions values ('hn-session', 'hn', 100000)"), /CHECK/);
db.exec('begin;\n' + migration + '\ncommit;');
assert.deepEqual(snapshot(), before);
assert.deepEqual(db.prepare('pragma foreign_key_check').all(), []);
assert.throws(() => db.exec("insert into preview_registration_sessions values ('bad-session', 'unknown', 100000)"), /CHECK/);

db.exec([
  "insert into registrations values ('hn-001', 'hn', '2026-11-24', 1, 'DEMO-A', 2000, null)",
  "insert into preview_registration_sessions values ('hn-session', 'hn', 100000)",
  "insert into preview_registration_submissions values ('hn-session', 'hn-001')",
  "update registrations set called_at = 5000 where id = 'hn-001'",
].join(';\n'));
assert.equal(db.prepare("select registration_id from display_state where branch = 'hn'").get().registration_id, 'hn-001');
assert.equal(db.prepare("select revision from display_state where branch = 'q1'").get().revision, 2);
assert.equal(db.prepare("select locked from preview_registration_edits where registration_id = 'hn-001'").get().locked, 1);
db.exec("update registrations set called_at = null where id = 'hn-001'");
assert.equal(db.prepare("select registration_id from display_state where branch = 'hn'").get().registration_id, null);
assert.equal(db.prepare("select locked from preview_registration_edits where registration_id = 'hn-001'").get().locked, 1);
assert.deepEqual(db.prepare('pragma foreign_key_check').all(), []);
const beforeHashMigration = db.prepare('select token_hash, registration_id from preview_registration_submissions order by token_hash').all().map(row => ({ ...row }));
db.exec(read('./migrations/0002_registration_request_hash.sql'));
const afterHashMigration = db.prepare('select token_hash, registration_id, request_hash from preview_registration_submissions order by token_hash').all();
assert.deepEqual(afterHashMigration.map(({ request_hash, ...row }) => {
  assert.equal(request_hash, null);
  return row;
}), beforeHashMigration);
const beforeQueueMigration = snapshot();
db.exec(read('./migrations/0004_preserve_reception_queue_state.sql'));
assert.deepEqual(snapshot().slice(1), beforeQueueMigration.slice(1));
const history = db.prepare('select state, called_at, last_called_at from registrations where id = ?').get('q1-001');
assert.deepEqual({ ...history }, { state: 'active', called_at: 3000, last_called_at: 4000 });
assert.deepEqual(db.prepare('select last_number from daily_queue_counters order by branch').all().map(row => row.last_number), [1, 1, 1]);
const beforeAuditMigration = snapshot();
db.exec(read('./migrations/0005_add_reception_history.sql'));
assert.deepEqual(snapshot().slice(1), beforeAuditMigration.slice(1));
assert.deepEqual(db.prepare('select count(*) as n from queue_calls').get().n, 0);
assert.deepEqual(db.prepare('select count(*) as n from audit_logs').get().n, 0);
assert.deepEqual(db.prepare('pragma foreign_key_check').all(), []);
console.log('PASS Hanoi migration preserves Q1/Q7 rows, sessions, print state and TV revisions, with isolated Hanoi state');
