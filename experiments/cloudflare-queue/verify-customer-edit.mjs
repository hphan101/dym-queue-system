import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRegistrationSessionToken, hashRegistrationSession } from '../../supabase/functions/_shared/registrationAccess.ts';
import { editPreviewRegistration } from './customer-edit.mjs';

const database = new DatabaseSync(':memory:');
database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const db = {
  prepare(query) {
    const statement = database.prepare(query.replace(/\?\d+/g, match => '$' + match.slice(1)));
    let args;
    return {
      bind(...values) {
        args = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
        return this;
      },
      first: () => statement.get(args),
      all() {
        if (statement.columns().length) return { results: statement.all(args) };
        return { meta: statement.run(args) };
      },
    };
  },
  async batch(statements) {
    database.exec('begin');
    try {
      const result = statements.map(statement => statement.all());
      database.exec('commit');
      return result;
    } catch (error) {
      database.exec('rollback');
      throw error;
    }
  },
};
const now = Date.parse('2026-11-24T05:00:00Z');
const token = createRegistrationSessionToken();
const hash = await hashRegistrationSession(token);
database.prepare("insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at) values ('r1', 'q1', '2026-11-24', 1, 'DEMO-1', ?)").run(now);
database.prepare("insert into preview_registration_sessions values (?, 'q1', ?)").run(hash, now + 120000);
database.prepare("insert into preview_registration_submissions (token_hash, registration_id) values (?, 'r1')").run(hash);

let notified = 0;
const call = (stamp, changes, branch = 'q1') =>
  editPreviewRegistration(db, branch, { sessionToken: token, changes }, stamp, () => notified++);
assert.equal((await call(now, { fullName: 'KHÁCH THỬ' }, 'q7')).status, 403);
assert.equal((await call(now + 150000, { fullName: 'TEST NAME' })).status, 200);
const invalidName = await call(now + 150001, { fullName: '王小明 TEST', email: 'test@example.com' });
assert.equal(invalidName.status, 400);
assert.deepEqual(await invalidName.json(), { code: 'INVALID_PASSPORT_NAME', field: 'fullName' });
assert.equal((await (await call(now + 150001)).json()).details.email, '');
assert.equal((await call(now + 599999, { fullName: 'TEST NAME' })).status, 200);
assert.equal(notified, 1);
const expired = await call(now + 600000, { fullName: 'THỬ LẠI' });
assert.equal(expired.status, 409);
assert.equal((await expired.json()).code, 'EDIT_SESSION_EXPIRED');
assert.equal((await (await call(now + 150000)).json()).details.fullName, 'TEST NAME');

database.prepare("update preview_registration_edits set details = json_set(details, '$.receptionNote', 'Ghi chú thử nội bộ') where registration_id = 'r1'").run();
assert.equal((await call(now + 150000, { phoneNumber: '' })).status, 400);
database.prepare("update preview_registration_edits set details = json_set(details, '$.tt25.checkupReason', 'Khám sức khỏe bổ sung hồ sơ xin Work Permit') where registration_id = 'r1'").run();
const workPermit = await (await call(now + 150001, { phoneNumber: ' ' })).json();
assert.equal(workPermit.details.phoneNumber, '');
assert.equal(workPermit.phoneRequired, false);
assert.equal(Object.hasOwn(workPermit.details, 'receptionNote'), false);
assert.equal(Object.hasOwn(workPermit.details, 'tt25'), false);

database.exec("update registrations set state = 'cancelled' where id = 'r1'");
const cancelled = await call(now + 170000, { fullName: 'THỬ LẠI' });
assert.equal(cancelled.status, 409);
assert.equal((await cancelled.json()).code, 'EDIT_LOCKED');
database.exec("update registrations set state = 'active' where id = 'r1'");
assert.equal((await (await call(now + 170000)).json()).details.fullName, 'TEST NAME');

database.exec("update registrations set called_at = registered_at + 300000 where id = 'r1'; update registrations set called_at = null where id = 'r1';");
const locked = await call(now + 300001, { fullName: 'THỬ LẠI' });
assert.equal(locked.status, 409);
assert.equal((await locked.json()).code, 'EDIT_LOCKED');
assert.equal(notified, 2);
const changes = database.prepare("select action, actor_id, entity_id from audit_logs where action = 'registration.customer_details_updated' order by rowid").all();
assert.deepEqual(changes.map(row => Object.values(row)), Array(2).fill(['registration.customer_details_updated', null, 'r1']));
console.log('PASS 10-minute edit deadline, same-branch access, repeat saves, Work Permit and private notes, and permanent call lock');
