const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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

test('Work Permit and other checkups default to Lao động tự do, while preserving an entered company', () => {
  for (const reason of constants.CHECKUP_REASONS.slice(1)) {
    assert.equal(constants.requiresCompanyName(reason), false);
    for (const company of ['', '  ', ' Công ty ABC ']) {
      const expected = company.trim() || 'Lao động tự do';
      assert.equal(constants.getRegistrationCompanyName(reason, company), expected);
      const payload = api.parsePayload({ ...validCustomer, checkupReason: reason, companyName: company });
      assert.equal(payload.companyName, expected);
      assert.equal(api.isValidPayload(payload), true);
    }
    assert.equal(api.parsePayload({ ...validCustomer, checkupReason: reason }).companyName, 'Lao động tự do');
  }
});
