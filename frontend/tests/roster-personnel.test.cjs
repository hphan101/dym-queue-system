const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const directory = path.resolve(__dirname, '../src/features/admin/roster');
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function loadService(supabase = {}) {
  const result = {};
  new Function('exports', 'require', compile(fs.readFileSync(path.join(directory, 'rosterService.ts'), 'utf8')))(
    result, () => ({ supabase }),
  );
  return result;
}

// Execute the actual import callback without mounting the authenticated React page.
function parseRows(rows, personnelList = []) {
  const source = fs.readFileSync(path.join(directory, 'RosterPersonnelPage.tsx'), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helpers = ast.statements.filter((node) => ts.isFunctionDeclaration(node) &&
    ['normalizePhone', 'normalizeName', 'inferRoleFromText'].includes(node.name?.text));
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'parsedImportRows') {
      callback = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  const service = loadService();
  const result = {};
  new Function('exports', 'importedFileRows', 'importRawText', 'personnelList',
    ...Object.keys(service), compile(`${helpers.map((node) => node.getText(ast)).join('\n')}\nexports.rows = (${callback})();`))(
    result, rows, '', personnelList, ...Object.values(service),
  );
  return result.rows;
}

test('personnel import accepts new columns with or without headers and retains leading zeroes', () => {
  const row = ['BS-001', 'Nguyễn Văn An', '001090000001', '012345/HCM-CCHN', '0901234567', 'an@dym.vn', '1.500.000', 'BS'];
  for (const rows of [[row], [['Staff ID', 'Tên', 'CCCD', 'Số CCHN', 'SĐT', 'Email', 'Lương / ngày', 'Phân loại'], row]]) {
    const [person] = parseRows(rows);
    assert.equal(person.identity_number, '001090000001');
    assert.equal(person.practicing_certificate, '012345/HCM-CCHN');
    assert.equal(person.phone_number, '0901234567');
    assert.equal(person.fixed_cost, 1500000);
    assert.equal(person.error, null);
  }
  assert.match(parseRows([[...row.slice(0, 2), '123', ...row.slice(3)]])[0].error, /12/);
});

test('legacy Excel import preserves saved identity fields; blank new columns explicitly clear them', () => {
  const existing = [{ personnel_code: 'BS-001', full_name: 'An', phone_number: '', role_type: 'doctor', identity_number: '001090000001', practicing_certificate: 'CCHN-123' }];
  const [legacy] = parseRows([['BS-001', 'An', 'BS', '1.500.000', '0901234567', 'an@dym.vn']], existing);
  assert.equal(legacy.identity_number, existing[0].identity_number);
  assert.equal(legacy.practicing_certificate, existing[0].practicing_certificate);
  assert.equal(legacy.error, null);
  const [updated] = parseRows([['BS-001', 'An', '', '', '', '', '1.500.000']], existing);
  assert.equal(updated.identity_number, '');
  assert.equal(updated.practicing_certificate, '');
});

test('personnel CRUD persists trimmed identifiers and rejects malformed identity numbers before writing', async () => {
  const writes = [];
  const query = {
    insert(payload) { writes.push(payload); return this; },
    update(payload) { writes.push(payload); return this; },
    upsert(payload) { writes.push(...payload); return this; },
    eq() { return this; },
    select() { return this; },
    single: async () => ({ data: writes.at(-1), error: null }),
    then(resolve) { return Promise.resolve({ data: writes, error: null }).then(resolve); },
  };
  const service = loadService({ from: () => query });
  const input = { personnel_code: 'BS-001', full_name: 'An', role_type: 'doctor', identity_number: ' 001090000001 ', practicing_certificate: ' CCHN-123 ', phone_number: '', email: '', fixed_cost: 1500000 };
  await service.saveMedicalPersonnel(input);
  await service.saveMedicalPersonnel({ ...input, id: 'existing' });
  await service.bulkImportMedicalPersonnel([input]);
  assert.equal(writes.length, 3);
  for (const payload of writes) {
    assert.equal(payload.identity_number, '001090000001');
    assert.equal(payload.practicing_certificate, 'CCHN-123');
    assert.equal(payload.fixed_cost, 1500000);
  }
  await assert.rejects(service.saveMedicalPersonnel({ ...input, identity_number: '123' }), /12/);
  await assert.rejects(service.bulkImportMedicalPersonnel([{ ...input, practicing_certificate: 'x'.repeat(101) }]), /100/);
  assert.equal(writes.length, 3);
});

test('downloaded Excel template matches the new import order and keeps CCCD as text', () => {
  const source = fs.readFileSync(path.join(directory, 'exportRosterExcel.ts'), 'utf8');
  const ast = ts.createSourceFile('excel.ts', source, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) &&
    ['renderRowXml', 'exportPersonnelTemplateExcel'].includes(node.name?.text));
  const xlsx = {};
  new Function('exports', compile(fs.readFileSync(path.resolve(__dirname, '../src/lib/xlsx.ts'), 'utf8')))(xlsx);
  let sheet;
  new Function('exports', 'triggerXlsxDownload', ...Object.keys(xlsx), compile(functions.map((node) => node.getText(ast)).join('\n') + '\nexportPersonnelTemplateExcel();'))(
    {}, (sheets) => { sheet = sheets[0].xml; }, ...Object.values(xlsx),
  );
  const expected = ['Staff ID', 'Tên', 'CCCD', 'Số CCHN', 'SĐT', 'Email', 'Lương / ngày (VNĐ)', 'Phân loại (BS / DD / KTV / CTV)'];
  let previous = -1;
  for (const label of expected) {
    const index = sheet.indexOf(label);
    assert.ok(index > previous, label);
    previous = index;
  }
  assert.match(sheet, /<c r="C2"[^>]*t="inlineStr"[^>]*>.*?001090000001/);
  assert.match(sheet, /<c r="G2"[^>]*><v>1500000<\/v>/);
});
