const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'Deno', code)(exports, (name) => mocks[name] ?? {}, { serve() {}, env: { get() {} } });
  return exports;
}

const constants = load('frontend/src/features/registration/tt25Constants.ts');
const http = load('supabase/functions/_shared/http.ts');
const api = load('supabase/functions/_shared/registrationPayload.ts', {
  './http.ts': http, './passportName.ts': load('supabase/functions/_shared/passportName.ts'),
});
const validCustomer = { branch: 'q1', fullName: 'NGUYEN VAN A', phoneNumber: '0901234567', birthDate: '2000-01-01', gender: 'Nam', cccd: 'B1234567', province: 'Hà Nội', ward: 'Cầu Giấy', addressDetail: '123 đường A' };

test('company checkups require a nonblank company in both the form policy and registration API', () => {
  for (const reason of [constants.CHECKUP_REASONS[0], 'Khám sức khỏe định kì theo công ty']) {
    assert.equal(constants.requiresCompanyName(reason), true);
    assert.equal(api.getInvalidPayloadField(api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: '  ' })), 'companyName');
    const payload = api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: ' DYM MEDICAL ' });
    assert.equal(payload.companyName, 'DYM MEDICAL');
    assert.equal(api.getInvalidPayloadField(payload), undefined);
  }
});

test('Work Permit and personal checkups leave company blank unless one is entered', () => {
  for (const reason of constants.CHECKUP_REASONS.slice(1)) {
    assert.equal(constants.requiresCompanyName(reason), false);
    for (const company of ['', '  ', ' Công ty ABC ']) {
      const payload = api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: company });
      assert.equal(payload.companyName, company.trim());
      assert.equal(api.getInvalidPayloadField(payload), undefined);
    }
    assert.equal(api.parsePayload({ ...validCustomer, checkupReason: reason }).companyName, '');
  }
});

test('only Work Permit accepts a blank phone number, and supplied numbers are validated', () => {
  for (const checkupReason of constants.CHECKUP_REASONS) {
    const workPermit = checkupReason === constants.CHECKUP_REASONS[1];
    assert.equal(constants.isWorkPermitCheckup(checkupReason), workPermit);
    for (const [phoneNumber, valid] of [
      [undefined, workPermit], ['', workPermit], ['  ', workPermit],
      ['123', false], ['abc', false], ['0901234567', true],
    ]) {
      const payload = api.parsePayload({ ...validCustomer, companyName: 'DYM MEDICAL', checkupReason, phoneNumber });
      assert.equal(Boolean(payload && !api.getInvalidPayloadField(payload)), valid, JSON.stringify({ checkupReason, phoneNumber }));
    }
  }
});

test('explicit passports bypass CCCD format, while CCCD and legacy submissions retain their checks', () => {
  const validator = load('frontend/src/features/registration/form/cccdValidator.ts');
  const checkupReason = constants.CHECKUP_REASONS[2];
  for (const [identityDocumentType, cccd, valid] of [
    ['passport', '123-45 / XY', true],
    ['passport', '123456789012', true],
    ['passport', ' ', false],
    ['cccd', '001200123456', true],
    ['cccd', '001300123456', false],
    ['cccd', 'B1234567', false],
    [undefined, 'B1234567', true],
  ]) {
    const data = { ...validCustomer, checkupReason, identityDocumentType, cccd };
    const payload = api.parsePayload(data);
    assert.equal(Boolean(payload && !api.getInvalidPayloadField(payload)), valid);
    assert.equal(validator.validateVietnamCccd(data) === null, valid);
  }
});

test('passport names accept Vietnamese accents and name separators but reject non-Latin scripts', () => {
  const data = { ...validCustomer, checkupReason: constants.CHECKUP_REASONS[2], identityDocumentType: 'passport' };
  for (const fullName of ['Yamada Taro', "Anne-Marie O'Brien", 'ANNE O’BRIEN', 'Nguyễn Văn A', 'Đặng Mỹ Duyên'.normalize('NFD')]) {
    assert.equal(api.getInvalidPayloadField(api.parsePayload({ ...data, fullName })), undefined);
  }
  for (const fullName of ['山田 太郎', '王小明', 'Taro 山田', 'YAMADA 2', 'ＮＡＭＥ']) {
    assert.equal(api.getInvalidPayloadField(api.parsePayload({ ...data, fullName })), 'fullName');
  }
  assert.equal(api.getInvalidPayloadField(api.parsePayload({ ...data, fullName: '王小明', identityDocumentType: undefined })), 'fullName');
  assert.equal(api.getInvalidPayloadField(api.parsePayload({ ...data, fullName: 'Nguyễn Văn A', cccd: '001200123456', identityDocumentType: 'cccd' })), undefined);
});

async function installRegistrationSchema(db) {
  const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
    create function public.can_access_branch(uuid) returns boolean language sql as $$ select true $$;
    insert into auth.users values (auth.uid());
    create role anon; create role authenticated; create role service_role;
  `);
  const schema = migration('20260728091142_initial_queue_schema.sql');
  await db.exec(schema.slice(schema.indexOf('create type'), schema.indexOf('create index')));
  await db.exec(`
    alter table public.registrations add column tt25_data jsonb default '{}'::jsonb;
    insert into public.branches (code, name, short_name) values ('q1', 'Quận 1', 'Q1'), ('q7', 'Quận 7', 'Q7');
  `);
  await db.exec(migration('20261101090000_add_registration_qr_sessions.sql'));
  await db.exec(migration('20261119150000_allow_blank_work_permit_phone.sql'));
  await db.exec(migration('20261120100000_allow_explicit_passport_format.sql'));
  return migration;
}

test('database issues and updates a Work Permit registration with a blank phone and an explicit passport', async () => {
  const db = new PGlite();
  try {
    await installRegistrationSchema(db);
    const hash = 'a'.repeat(64);
    await db.query(`
      insert into public.registration_access_sessions(token_hash, branch_id, expires_at)
      select $1, id, now() + interval '20 minutes' from public.branches where code = 'q1'
    `, [hash]);
    const issue = (checkupReason, phone, identityDocumentType = 'passport') => db.query(`
      select * from public.issue_registration_with_session(
        $1, repeat('b', 64), 'q1', 'Nguyễn Văn A', '2000-01-01', 'Nam', $2,
        '123-45 / XY', '', 'Hà Nội', 'Cầu Giấy', '123 đường A', repeat('c', 64), 600, $3
      )
    `, [hash, phone, { checkupReason, identityDocumentType }]);
    const workPermit = constants.CHECKUP_REASONS[1];
    await assert.rejects(issue(constants.CHECKUP_REASONS[2], ''), /INVALID_DATA/);
    await assert.rejects(issue(workPermit, '123'), /INVALID_DATA/);
    await assert.rejects(issue(workPermit, '', 'cccd'), /INVALID_DATA/);
    const { registration_id: id } = (await issue(workPermit, '')).rows[0];
    await db.query(`
      select public.update_registration_details(
        $1, 'Nguyễn Văn B', '2000-01-01', 'Nam', '', '123-45 / XY', '', 'Hà Nội', 'Cầu Giấy', '123 đường A'
      )
    `, [id]);
    assert.deepEqual((await db.query('select full_name, phone_number, identity_document from public.registrations where id = $1', [id])).rows,
      [{ full_name: 'Nguyễn Văn B', phone_number: '', identity_document: '123-45 / XY' }]);
  } finally {
    await db.close();
  }
});

test('CCCD and passport numbers each have a one-hour cooldown per branch', async () => {
  const db = new PGlite();
  try {
    const migration = await installRegistrationSchema(db);
    const cccd = '001200123456';
    const passport = 'B1234567';
    const issue = (branch, document, phone, fingerprint, identityDocumentType) => db.query(`
      select * from public.issue_registration(
        $1, 'Khách thử', '2000-01-01', 'Nam', $2, $3, '', 'Hà Nội', 'Cầu Giấy',
        '123 Đường A', $4, 600, $5
      )
    `, [branch, phone, document, fingerprint.repeat(64), identityDocumentType ? { identityDocumentType } : {}]);

    const firstCccd = (await issue('q1', cccd, '0901234567', 'a')).rows[0];
    const firstPassport = (await issue('q1', passport, '0901234567', 'p')).rows[0];
    await db.exec("update public.registrations set registered_at = clock_timestamp() - interval '30 minutes'");
    await db.exec(migration('20261121110000_limit_repeat_identity_document_by_branch.sql'));

    const cooldownError = (type) => (error) =>
      error.message === 'IDENTITY_DOCUMENT_COOLDOWN' && error.hint === type
      && Number(error.detail) > 1700 && Number(error.detail) <= 1800;
    await assert.rejects(issue('q1', cccd, '0911234567', 'b', 'cccd'), cooldownError('cccd'));
    await assert.rejects(issue('q1', ' b1234567 ', '0911234567', 's', 'passport'), cooldownError('passport'));
    assert.equal((await issue('q7', cccd, '0911234567', 'c', 'cccd')).rows.length, 1);
    assert.equal((await issue('q7', passport, '0911234567', 't', 'passport')).rows.length, 1);
    assert.equal((await issue('q1', '001200123457', '0911234567', 'd', 'cccd')).rows.length, 1);

    await db.query("update public.registrations set registered_at = clock_timestamp() - interval '61 minutes' where id in ($1, $2)", [firstCccd.registration_id, firstPassport.registration_id]);
    assert.equal((await issue('q1', cccd, '0911234567', 'b', 'cccd')).rows.length, 1);
    assert.equal((await issue('q1', passport, '0911234567', 's', 'passport')).rows.length, 1);
    assert.equal((await issue('q1', cccd, '0911234567', 'e', 'passport')).rows.length, 1);
    await assert.rejects(issue('q1', cccd, '0911234567', 'f', 'passport'), (error) =>
      error.message === 'IDENTITY_DOCUMENT_COOLDOWN' && error.hint === 'passport');
  } finally {
    await db.close();
  }
});

test('a submitted QR session can edit only its original waiting registration within ten minutes', async () => {
  const db = new PGlite();
  try {
    const migration = await installRegistrationSchema(db);
    await db.exec('alter table public.registrations add column first_called_at timestamptz');
    await db.exec(migration('20261122100000_allow_customer_registration_edits.sql'));
    const hash = 'a'.repeat(64);
    const unused = 'd'.repeat(64);
    await db.query(`
      insert into public.registration_access_sessions (token_hash, branch_id, expires_at)
      select token, id, now() + interval '20 minutes'
      from public.branches cross join unnest($1::text[]) as tokens(token) where code = 'q1'
    `, [[hash, unused]]);
    const edit = async (changes = null, token = hash, branch = 'q1') => (await db.query(
      'select public.edit_registration_with_session($1, $2, $3) as result', [token, branch, changes],
    )).rows[0].result;
    const request = `select * from public.issue_registration_with_session(
      $1, repeat('b', 64), 'q1', 'Nguyễn Văn A', '2000-01-01', 'Nam', '0901234567',
      'TEST123456', '', 'Hà Nội', 'Cầu Giấy', '123 đường A', repeat('c', 64), 600, $2
    )`;
    const extras = { checkupReason: constants.CHECKUP_REASONS[1], identityDocumentType: 'passport',
      email: 'original@example.test', consentAgreed: true, pregnancyStatus: 'suspected' };
    const receipt = (await db.query(request, [hash, extras])).rows[0];
    await db.exec(migration('20261127100000_require_latin_passport_names.sql'));
    await db.query('update public.registrations set full_name = full_name where id = $1', [receipt.registration_id]);
    await db.query("update public.registration_access_sessions set expires_at = now() - interval '1 second' where token_hash = $1", [hash]);

    assert.equal((await edit()).details.fullName, 'Nguyễn Văn A');
    assert.equal((await edit()).phoneRequired, false);
    assert.deepEqual(Object.keys((await edit()).details).sort(), ['addressDetail', 'email', 'fullName', 'phoneNumber', 'province', 'ward', 'workplace']);
    await assert.rejects(edit(null, unused), /EDIT_SESSION_INVALID/);
    await assert.rejects(edit(null, 'b'.repeat(64)), /EDIT_SESSION_INVALID/);
    await assert.rejects(edit(null, hash, 'q7'), /EDIT_SESSION_INVALID/);
    for (const changes of [{ queueNumber: 99 }, { cccd: 'TEST999999' }, { printedTT25: false }, { email: null }]) {
      await assert.rejects(edit(changes), /INVALID_DATA/);
    }
    await assert.rejects(edit({ email: 'bad@' }), (error) => error.message === 'INVALID_DATA' && error.detail === 'email');
    await assert.rejects(edit({ phoneNumber: 'bad' }), (error) => error.message === 'INVALID_DATA' && error.detail === 'phoneNumber');
    await assert.rejects(edit({ fullName: '山田 太郎', phoneNumber: '' }), (error) =>
      error.message === 'INVALID_DATA' && error.detail === 'fullName' && error.hint === 'passport_name');
    assert.equal((await edit()).details.phoneNumber, '0901234567');

    const changes = { fullName: 'Đặng Mỹ Duyên', phoneNumber: '', email: '', province: 'Thành phố Hồ Chí Minh',
      ward: 'Phường Sài Gòn', addressDetail: '45 đường B', workplace: 'Công ty thử' };
    assert.deepEqual((await edit(changes)).details, changes);
    assert.deepEqual((await edit(changes)).details, changes);
    const row = (await db.query('select * from public.registrations')).rows[0];
    assert.equal(row.id, receipt.registration_id);
    assert.equal(row.queue_number, Number(receipt.queue_number));
    assert.equal(row.identity_document, 'TEST123456');
    assert.equal(row.tt25_data.email, undefined);
    assert.equal(row.tt25_data.consentAgreed, true);
    assert.equal(row.tt25_data.pregnancyStatus, 'suspected');
    assert.equal((await db.query('select count(*)::int as n from public.audit_logs')).rows[0].n, 1);

    await db.query(`update public.registrations set phone_number = '0901234567', tt25_data = tt25_data || $1::jsonb`, [{ checkupReason: constants.CHECKUP_REASONS[0] }]);
    await assert.rejects(edit({ workplace: '' }), (error) => error.detail === 'workplace');
    await assert.rejects(edit({ phoneNumber: '' }), (error) => error.detail === 'phoneNumber');
    for (const printed of ['printedConsent', 'printedTT25']) {
      await db.query('update public.registrations set tt25_data = tt25_data || $1::jsonb', [{ [printed]: true }]);
      await assert.rejects(edit(), /EDIT_LOCKED/);
      await assert.rejects(edit({ fullName: 'Nguyễn Văn C' }), /EDIT_LOCKED/);
      await db.query('update public.registrations set tt25_data = tt25_data - $1::text', [printed]);
    }
    await db.exec(`insert into public.queue_calls (branch_id, registration_id, call_kind, called_by)
      select branch_id, id, 'next', auth.uid() from public.registrations`);
    await assert.rejects(edit({ fullName: 'Nguyễn Văn C' }), /EDIT_LOCKED/);
    await db.exec('delete from public.queue_calls');
    await db.exec("update public.registrations set registered_at = now() - interval '10 minutes'");
    await assert.rejects(edit(), /EDIT_SESSION_EXPIRED/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(edit(), /permission denied/);
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});
