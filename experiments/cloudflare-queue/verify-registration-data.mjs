import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRegistrationSessionToken, hashRegistrationSession } from '../../supabase/functions/_shared/registrationAccess.ts';
import { registerPreview } from './access.mjs';
import { registrationRetryAfter } from './registration-rate-limit.mjs';
import { loadReceptionSnapshot } from './reception-snapshot.mjs';
import { receptionApi } from './reception.mjs';
import { getDefaultPermissions } from '../../supabase/functions/_shared/staffPermissions.ts';
import { readPreviewRegistration } from './preview-registration-data.mjs';
import { readRegistration } from './registration-data.mjs';
import { CONSENT_FORM_VERSION, INITIAL_TT25_MEDICAL_HISTORY, INITIAL_TT25_TARGET_PAYMENT } from '../../frontend/src/features/registration/tt25Types.ts';

const day = '2026-11-24';
const passport = {
  branch: 'q1', identityDocumentType: 'passport', cccd: 'DEMO-WP-01', fullName: 'TARO YAMADA TEST',
  birthDate: '1990-01-01', gender: 'Nam', phoneNumber: '', email: 'khach-thu@example.com',
  province: 'Thành phố Hồ Chí Minh', ward: 'Phường Tân Mỹ', addressDetail: 'Địa chỉ thử',
  companyName: '', checkupReason: 'Khám sức khỏe bổ sung hồ sơ xin Work Permit', language: 'vi',
  consentAgreed: true, advertisingConsentAgreed: false, consentFormVersion: CONSENT_FORM_VERSION,
  medicalHistory: INITIAL_TT25_MEDICAL_HISTORY, targetPayment: INITIAL_TT25_TARGET_PAYMENT,
};
const run = data => readPreviewRegistration(data, day);
assert.equal(run(passport).details.phoneNumber, '');
assert.equal(run({ ...passport, fullName: 'ĐẶNG MỸ DUYÊN TEST' }).details.fullName, 'ĐẶNG MỸ DUYÊN TEST');
assert.equal(run({ ...passport, fullName: '山田 太郎 TEST' }).field, 'fullName');
assert.equal(run(passport).details.tt25.advertisingConsentAgreed, false);
assert.equal(run({ ...passport, email: undefined }).details.email, '');
const cccd = {
  ...passport, identityDocumentType: 'cccd', cccd: '000190123456', gender: 'Nữ', pregnancyStatus: 'not_pregnant',
  checkupReason: 'Khám sức khỏe khác', phoneNumber: '0000000001',
};
assert.equal(run(cccd).details.tt25.identityDocumentType, 'cccd');
assert.equal(run({ ...cccd, cccd: '000090123456' }).field, 'cccd');
assert.equal(run({ ...cccd, cccd: '079190123456' }).field, 'cccd');
assert.equal(run({ ...cccd, phoneNumber: '' }).field, 'phoneNumber');
assert.equal(run({ ...cccd, checkupReason: 'Khám sức khỏe định kì doanh nghiệp' }).field, 'companyName');
assert.equal(run({ ...cccd, checkupReason: 'Khám sức khỏe định kì doanh nghiệp', companyName: 'Công ty thử' }).details.workplace, 'Công ty thử');
assert.equal(run({ ...passport, advertisingConsentAgreed: undefined }).field, 'consent');
assert.equal(run({ ...passport, birthDate: '2008-11-25' }).field, 'birthDate');
assert.equal(run({ ...passport, birthDate: '2008-11-24' }).details.birthDate, '2008-11-24');
assert.equal(run({ ...passport, email: 'someone@example.edu' }).field, 'email');
console.log('PASS preview form validation for passport, CCCD, age, Work Permit, company and consent');
const applicationForm = {
  ...passport, cccd: 'LAB ONLY / 123', fullName: 'Yamada Taro', addressDetail: 'Địa chỉ mô phỏng số 15',
  email: 'nguyen.van@sample.invalid',
};
assert.equal(readRegistration(applicationForm, day).details.phoneNumber, '');
assert.equal(readRegistration(applicationForm, day).document, 'LAB ONLY / 123');
assert.equal(readRegistration(applicationForm, day).details.fullName, 'YAMADA TARO');
assert.equal(readRegistration({ ...applicationForm, fullName: '王小明' }, day).field, 'fullName');
assert.equal(run(applicationForm).field, 'fullName');
const citizen = { ...applicationForm, fullName: 'Nguyễn Văn Mẫu', cccd: '079090999999', phoneNumber: '0900000000', identityDocumentType: 'cccd' };
assert.equal(readRegistration(citizen, day).details.tt25.identityDocumentType, 'cccd');
assert.equal(readRegistration({ ...citizen, cccd: '079091999999' }, day).field, 'cccd');
assert.equal(readRegistration({ ...citizen, gender: 'Nữ', pregnancyStatus: 'not_pregnant' }, day).field, 'cccd');
assert.equal(readRegistration({ ...applicationForm, email: 'invalid-address' }, day).field, 'email');
assert.equal(readRegistration({ ...applicationForm, checkupReason: 'Khám sức khỏe định kì doanh nghiệp' }, day).field, 'phoneNumber');
assert.equal(readRegistration({ ...citizen, checkupReason: 'Khám sức khỏe định kì doanh nghiệp' }, day).field, 'companyName');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql) {
    const numbered = /\?\d+/.test(sql);
    const statement = sqlite.prepare(sql.replace(/\?(\d+)/g, '$$$1'));
    return { bind(...values) {
      const args = numbered ? [Object.fromEntries(values.map((value, i) => [i + 1, value]))] : values;
      return {
        first: () => statement.get(...args),
        all: () => ({ results: statement.all(...args) }),
        run: () => statement.run(...args),
        execute: () => statement.columns().length ? { results: statement.all(...args) } : { meta: statement.run(...args) },
      };
    } };
  },
  batch(statements) {
    sqlite.exec('begin');
    try {
      const results = statements.map(statement => statement.execute());
      sqlite.exec('commit');
      return results;
    } catch (error) {
      sqlite.exec('rollback');
      throw error;
    }
  },
};
const now = Date.parse(`${day}T08:00:00Z`);
const hour = 60 * 60_000;
const secret = 'test-rate-limit-only';
const stamp = minutes => new Date(now + minutes * 60_000).toISOString();
const sourceBranch = '11111111-1111-4111-8111-111111111111';
const sourceActor = '33333333-3333-4333-8333-333333333333';
const ticketId = index => `22222222-2222-4222-8222-22222222222${index}`;
const sourceSession = createRegistrationSessionToken();
const sourceForm = { ...applicationForm, cccd: 'DEMO-IMPORTED-3', registrationSession: sourceSession };
const sourceHash = createHmac('sha256', secret).update('registration-request|' +
  JSON.stringify(readRegistration(sourceForm, day).payload)).digest('hex');
const snapshot = {
  branches: [{ id: sourceBranch, code: 'q1' }],
  registrations: ['active', 'cancelled', 'completed', 'active'].map((state, i) => ({
    id: ticketId(i), branch_id: sourceBranch,
    queue_date: day, queue_number: 21 + i, state, identity_document: i < 2 ? citizen.cccd : `DEMO-IMPORTED-${i}`,
    full_name: `KHÁCH THỬ ${i}`, birth_date: '1990-01-01', gender: 'Nam', phone_number: '0000000000',
    company_name: '', province: 'Thành phố Hồ Chí Minh', ward: 'Phường Tân Mỹ', address_detail: 'Địa chỉ thử',
    reception_note: 'Ghi chú thử', registered_at: stamp(-15), first_called_at: i === 0 ? stamp(-5) : null,
    last_called_at: i === 0 ? stamp(-2) : null, first_called_by: i === 0 ? sourceActor : null,
    tt25_data: { ...(i === 0 ? {} : { identityDocumentType: 'passport' }),
      email: 'test@example.com', printedTT25: i === 0, advertisingConsentAgreed: false },
  })),
  daily_queue_counters: [{ branch_id: sourceBranch, queue_date: day, last_number: 50 }],
  branch_display_state: [{ branch_id: sourceBranch, registration_id: '22222222-2222-4222-8222-222222222220',
    queue_date: day, queue_number: 21, called_at: stamp(-2), revision: 10 }],
  queue_calls: [
    { id: 'next-21', registration_id: ticketId(0), call_kind: 'next', called_at: stamp(-5) },
    { id: 'recall-21', registration_id: ticketId(0), call_kind: 'recall', called_at: stamp(-2) },
    { id: 'next-24', registration_id: ticketId(3), call_kind: 'next', called_at: stamp(-7) },
  ].map(call => ({ ...call, branch_id: sourceBranch, called_by: sourceActor })),
  audit_logs: [{ id: '9007199254740993', branch_id: sourceBranch, actor_id: sourceActor, action: 'queue.returned_to_waiting',
    entity_type: 'registration', entity_id: ticketId(3), metadata: { display_cleared: true }, created_at: stamp(-6) }],
  registration_access_sessions: [{ token_hash: await hashRegistrationSession(sourceSession), branch_id: sourceBranch,
    expires_at: stamp(12), registration_id: ticketId(3), request_hash: sourceHash }],
};
assert.throws(() => loadReceptionSnapshot(sqlite, { ...snapshot, queue_calls: [{ ...snapshot.queue_calls[0], registration_id: 'missing' }] }), /matching registration/);
assert.throws(() => loadReceptionSnapshot(sqlite, { ...snapshot, daily_queue_counters: [] }), /missing a counter/);
assert.throws(() => loadReceptionSnapshot(sqlite, { ...snapshot, branch_display_state: [{ ...snapshot.branch_display_state[0], queue_number: 25 }] }), /TV state/);
assert.deepEqual(loadReceptionSnapshot(sqlite, snapshot), { registrations: 4, counters: 1, displays: 1, calls: 3, auditLogs: 1, sessions: 1 });
assert.throws(() => loadReceptionSnapshot(sqlite, snapshot), /fresh rehearsal database/);
const replaySource = data => registerPreview(new Request('https://app.example.test', {
  method: 'POST', body: JSON.stringify(data),
}), db, day, now, () => assert.fail('An imported receipt must not announce another ticket.'), secret, false);
assert.deepEqual(await (await replaySource(sourceForm)).json(), { success: true, queueDate: day, queueNumber: '024' });
assert.equal((await replaySource({ ...sourceForm, fullName: 'OTHER NAME' })).status, 403);
const staff = { id: 'staff-test', role: 'admin', branches: ['q1'], permissions: getDefaultPermissions('admin') };
const receive = async (route, args = {}, minutes = 0, application = false) => {
  const response = await receptionApi(new Request('https://staging.example.com/rest/v1/rpc/' + route, {
    method: 'POST', body: JSON.stringify({ p_branch_code: 'q1', p_queue_date: day, ...args }),
  }), { DB: db, DYM_APP_ORIGIN: application ? 'https://staging.example.com' : undefined },
    day, Date.parse(stamp(minutes)), () => {}, staff);
  assert.equal(response.status, 200);
  return response.json();
};
const imported = await receive('get_registration_details');
assert.deepEqual(imported.map(row => row.state), ['active', 'cancelled', 'completed', 'active']);
assert.equal(imported[0].first_called_at, stamp(-5));
assert.equal(imported[0].last_called_at, stamp(-2));
assert.equal(sqlite.prepare('select first_called_by from registrations where id = ?').get(imported[0].id).first_called_by, sourceActor);
assert.equal(sqlite.prepare('select id from audit_logs').get().id, '9007199254740993');
assert.equal(imported[0].tt25_data.printedTT25, true);
assert.equal(imported[0].tt25_data.advertisingConsentAgreed, false);
assert.equal(imported[0].reception_note, 'Ghi chú thử');
assert.equal(imported[0].tt25_data.email, 'test@example.com');
const applicationRows = await receive('get_registration_details', {}, 0, true);
assert.equal(applicationRows[0].identity_document, citizen.cccd);
assert.equal(applicationRows[0].tt25_data.identityDocumentType, undefined, 'Legacy records must still use the existing validation fallback');
assert.equal(applicationRows[1].identity_document, citizen.cccd);
assert.equal(applicationRows[1].tt25_data.identityDocumentType, 'passport', 'An explicitly selected passport may have 12 digits');
assert.equal(imported[0].tt25_data.identityDocumentType, 'passport', 'The synthetic demo still defaults to passports');
assert.deepEqual((await receive('get_dashboard_registrations')).map(row => row.queue_number), [21, 24]);
assert.deepEqual(await receive('get_reception_trend', { p_year: 2026 }), [{ queue_date: day, total: 3 }]);
assert.equal(sqlite.prepare('select locked from preview_registration_edits where registration_id = ?').get(imported[3].id).locked, 1);
const [called] = await receive('call_next_queue');
assert.equal(called.queue_number, 24);
await receive('recall_current_queue', {}, 1);
const recalled = (await receive('get_registration_details')).find(row => row.queue_number === 24);
assert.equal(recalled.first_called_at, stamp(0));
assert.equal(recalled.last_called_at, stamp(1));
assert.equal(sqlite.prepare('select revision from display_state where branch = ?').get('q1').revision, 12);
const [returned] = await receive('return_called_queue_to_waiting', { p_registration_id: called.registration_id }, 2);
assert.equal(returned.display_cleared, true);
assert.deepEqual(await receive('return_called_queue_to_waiting', { p_registration_id: called.registration_id }, 2), []);
const cleared = sqlite.prepare('select registration_id, queue_date, queue_number, called_at from display_state where branch = ?').get('q1');
assert.deepEqual(Object.values(cleared), [null, null, null, null]);
assert.deepEqual(sqlite.prepare('select call_kind, called_by, called_at from queue_calls where registration_id = ? order by called_at')
  .all(called.registration_id).map(row => Object.values(row)), [
  ['next', sourceActor, Date.parse(stamp(-7))], ['next', staff.id, now], ['recall', staff.id, Date.parse(stamp(1))],
]);
const noteArgs = { p_registration_id: called.registration_id, p_note: 'Ghi chú thử đã sửa', p_expected_note: 'Ghi chú thử' };
await receive('update_registration_reception_note', noteArgs, 3);
await receive('update_registration_reception_note', noteArgs, 3);
const logActions = sqlite.prepare("select action, actor_id from audit_logs where id like 'cf-%' order by rowid")
  .all().map(row => Object.values(row));
assert.deepEqual(logActions, ['queue.called_next', 'queue.recalled', 'queue.returned_to_waiting', 'registration.note_updated'].map(action => [action, staff.id]));
console.log('PASS source call and audit history, original actor and IDs, atomic queue history and idempotent note logging');

const writeHistory = (values, editor = { ...staff, role: 'receptionist', permissions: getDefaultPermissions('receptionist') }) =>
  receptionApi(new Request('https://staging.example.com/rest/v1/rpc/update_registration_medical_history', {
    method: 'POST', body: JSON.stringify({ p_registration_id: imported[0].id, ...values }),
  }), { DB: db }, day, now, () => {}, editor);
const draftHistory = { familyHistory: { hasDisease: true, diseaseDetails: 'Tiền sử thử' },
  personalHistory: { 7: true }, personalOtherDetails: '', currentTreatment: { isTreating: null, medications: '' } };
const historyArgs = { p_history: draftHistory, p_expected_history: imported[0].tt25_data.medicalHistory ?? null };
assert.equal((await writeHistory(historyArgs, { ...staff, branches: ['q7'] })).status, 403);
assert.equal((await writeHistory(historyArgs, { ...staff, permissions: getDefaultPermissions('none') })).status, 403);
const updateHistory = await writeHistory(historyArgs);
assert.equal(updateHistory.status, 200);
assert.deepEqual(await updateHistory.json(), { ...draftHistory, commitmentAgreed: false });
assert.equal((await writeHistory(historyArgs)).status, 200);
assert.equal((await writeHistory({ ...historyArgs, p_history: { ...draftHistory, personalHistory: { 7: false } } })).status, 409);
const [updatedRegistration] = await receive('get_registration_details');
assert.deepEqual(updatedRegistration.tt25_data.medicalHistory, { ...draftHistory, commitmentAgreed: false });
assert.equal(updatedRegistration.tt25_data.printedTT25, true);
assert.equal(updatedRegistration.tt25_data.advertisingConsentAgreed, false);
assert.equal(sqlite.prepare("select count(*) as count from audit_logs where action = 'registration.medical_history_updated'").get().count, 1);
console.log('PASS reception medical history branch and role checks, write, stale edits, and print data');

async function session(branch, time = now) {
  const token = createRegistrationSessionToken();
  sqlite.prepare('insert into preview_registration_sessions values (?, ?, ?)')
    .run(await hashRegistrationSession(token), branch, time + 20 * 60_000);
  return token;
}
let notices = 0;
const submit = (data, token, time = now) => registerPreview(new Request('https://staging.example.com', {
  method: 'POST', body: JSON.stringify({ ...data, registrationSession: token }),
}), db, day, time, () => notices++, secret);

const token = await session('q1');
const first = await submit(passport, token);
assert.equal(first.status, 201);
assert.equal((await first.clone().json()).queueNumber, '51');
assert.deepEqual(await (await submit(passport, token)).json(), await first.json());
const changed = await submit({ ...passport, fullName: 'OTHER TEST NAME' }, token);
assert.equal(changed.status, 403);
assert.equal((await changed.json()).code, 'REGISTRATION_SESSION_INVALID');
assert.equal(notices, 1);
assert.equal((await submit(passport, await session('q7'))).status, 403);

const repeated = await submit({ ...passport, phoneNumber: '0000000002' }, await session('q1'));
assert.equal(repeated.status, 429);
assert.equal(repeated.headers.get('Retry-After'), '3600');
assert.match((await repeated.json()).error, /Hộ chiếu.*60 phút/);
assert.equal((await submit({ ...passport, branch: 'q7' }, await session('q7'))).status, 201);
assert.equal((await submit(cccd, await session('q1'))).status, 201);
const almostHour = now + hour - 1;
const repeatedCccd = await submit({ ...cccd, language: 'en' }, await session('q1', almostHour), almostHour);
assert.equal(repeatedCccd.headers.get('Retry-After'), '1');
assert.equal((await repeatedCccd.json()).code, 'IDENTITY_DOCUMENT_COOLDOWN');
assert.equal((await submit(cccd, await session('q1', now + hour), now + hour)).status, 201);

sqlite.prepare(`update preview_registration_edits set details = json_set(details, '$.identityDocument', 'DEMO-WP-NEW')
  where registration_id = (select id from registrations where branch = 'q1' and demo_code = 'DEMO-WP-01')`).run();
assert.equal((await submit({ ...passport, cccd: 'DEMO-WP-NEW' }, await session('q1'))).status, 429);
assert.equal((await submit(passport, await session('q1'))).status, 201);
assert.equal((await submit(passport, token)).status, 200);
assert.equal((await submit(passport, token, now + 20 * 60_000)).status, 403);
sqlite.prepare('insert into daily_queue_counters values (?, ?, ?)').run('hn', day, 9999);
const full = await submit({ ...passport, branch: 'hn' }, await session('hn'));
assert.equal(full.status, 409);
assert.equal((await full.json()).code, 'QUEUE_LIMIT_REACHED');
assert.deepEqual(sqlite.prepare('pragma foreign_key_check').all(), []);
console.log('PASS one-hour cutoff, branch scoping, corrected document, exact retries, QR session expiry and daily queue limit');

const count = sqlite.prepare('select count(*) as n from registrations');
const beforeTrap = count.get().n;
const trap = await submit({ ...passport, cccd: 'DEMO-HONEYPOT', honeypot: 'test' }, await session('q1'));
assert.equal(trap.status, 200);
assert.equal((await trap.json()).queueNumber, '999');
assert.equal(count.get().n, beforeTrap);
const client = '192.0.2.8';
assert.equal(await registrationRetryAfter(db, client, secret, now), 0);
const clientRow = sqlite.prepare('select fingerprint from preview_registration_ip_limits where started_at = ?').get(now);
assert.match(clientRow.fingerprint, /^[0-9a-f]{64}$/);
sqlite.prepare('update preview_registration_ip_limits set request_count = 599 where fingerprint = ?').run(clientRow.fingerprint);
assert.deepEqual((await Promise.all([registrationRetryAfter(db, client, secret, now), registrationRetryAfter(db, client, secret, now)])).sort(), [0, 600]);
assert.equal(await registrationRetryAfter(db, client, secret, now + 599_999), 1);
assert.equal(await registrationRetryAfter(db, client, secret, now + 600_000), 0);
assert.equal(await registrationRetryAfter(db, '192.0.2.9', secret, now), 0);
sqlite.prepare('update preview_registration_ip_limits set request_count = 30').run();
const limited = await submit({ ...passport, cccd: 'DEMO-BLOCKED' }, await session('q1'), now + hour);
assert.equal(limited.status, 429);
assert.equal((await limited.json()).code, 'RATE_LIMITED');
assert.equal(limited.headers.get('Retry-After'), '600');
assert.equal(count.get().n, beforeTrap);
console.log('PASS private network identifiers, concurrent rate cap, exact window reset and no ticket issued for blocked requests');
