const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, expose = '') {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'Deno', code + expose)(exports, (name) => mocks[name] ?? {}, { serve() {}, env: { get() {} } });
  return exports;
}

const constants = load('frontend/src/features/registration/tt25Constants.ts');
const http = load('supabase/functions/_shared/http.ts');
const api = load('supabase/functions/register/index.ts', { '../_shared/http.ts': http }, '\nexports.parsePayload = parsePayload; exports.isValidPayload = isValidPayload;');
const validCustomer = { branch: 'q1', fullName: 'Nguyễn Văn A', phoneNumber: '0901234567', birthDate: '2000-01-01', gender: 'Nam', cccd: 'B1234567', province: 'Hà Nội', ward: 'Cầu Giấy', addressDetail: '123 đường A' };

test('company checkups require a nonblank company in both the form policy and registration API', () => {
  for (const reason of [constants.CHECKUP_REASONS[0], 'Khám sức khỏe định kì theo công ty']) {
    assert.equal(constants.requiresCompanyName(reason), true);
    assert.equal(constants.getRegistrationCompanyName(reason, '  '), '');
    assert.equal(api.isValidPayload(api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: '  ' })), false);
    const payload = api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: ' DYM MEDICAL ' });
    assert.equal(payload.companyName, 'DYM MEDICAL');
    assert.equal(api.isValidPayload(payload), true);
  }
});

test('Work Permit leaves company blank, while other checkups keep their default', () => {
  for (const [reason, fallback] of [
    [constants.CHECKUP_REASONS[1], ''],
    [constants.CHECKUP_REASONS[2], 'Lao động tự do'],
  ]) {
    assert.equal(constants.requiresCompanyName(reason), false);
    for (const company of ['', '  ', ' Công ty ABC ']) {
      const expected = company.trim() || fallback;
      assert.equal(constants.getRegistrationCompanyName(reason, company), expected);
      const payload = api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: company });
      assert.equal(payload.companyName, expected);
      assert.equal(api.isValidPayload(payload), true);
    }
    assert.equal(api.parsePayload({ ...validCustomer, checkupReason: reason }).companyName, fallback);
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
      assert.equal(Boolean(payload && api.isValidPayload(payload)), valid, JSON.stringify({ checkupReason, phoneNumber }));
    }
  }
});

test('database issues and updates a Work Permit registration with a blank phone number', async () => {
  const db = new PGlite();
  const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  try {
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
      insert into public.branches (code, name, short_name) values ('q1', 'Quận 1', 'Q1');
    `);
    await db.exec(migration('20261101090000_add_registration_qr_sessions.sql'));
    await db.exec(migration('20261119150000_allow_blank_work_permit_phone.sql'));
    const hash = 'a'.repeat(64);
    await db.query(`
      insert into public.registration_access_sessions(token_hash, branch_id, expires_at)
      select $1, id, now() + interval '20 minutes' from public.branches where code = 'q1'
    `, [hash]);
    const issue = (checkupReason, phone) => db.query(`
      select * from public.issue_registration_with_session(
        $1, repeat('b', 64), 'q1', 'Nguyễn Văn A', '2000-01-01', 'Nam', $2,
        'B1234567', '', 'Hà Nội', 'Cầu Giấy', '123 đường A', repeat('c', 64), 600, $3
      )
    `, [hash, phone, { checkupReason }]);
    const workPermit = constants.CHECKUP_REASONS[1];
    await assert.rejects(issue(constants.CHECKUP_REASONS[2], ''), /INVALID_DATA/);
    await assert.rejects(issue(workPermit, '123'), /INVALID_DATA/);
    const { registration_id: id } = (await issue(workPermit, '')).rows[0];
    await db.query(`
      select public.update_registration_details(
        $1, 'Nguyễn Văn B', '2000-01-01', 'Nam', '', 'B1234567', '', 'Hà Nội', 'Cầu Giấy', '123 đường A'
      )
    `, [id]);
    assert.deepEqual((await db.query('select full_name, phone_number from public.registrations where id = $1', [id])).rows,
      [{ full_name: 'Nguyễn Văn B', phone_number: '' }]);
  } finally {
    await db.close();
  }
});
