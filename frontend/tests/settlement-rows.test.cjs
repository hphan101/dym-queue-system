const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = path.resolve(__dirname, '../src');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(src, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('exports', 'require', code)(exports, name => imports[name] ?? {});
  return exports;
}
const rowsModule = load('features/admin/roster/settlement/settlementRows.ts');
const { buildSettlementRows } = rowsModule;
const people = [
  { id: 'a', personnel_code: 'BS-001', full_name: 'An', role_type: 'doctor', phone_number: '090111', fixed_cost: 999999, email: '' },
  { id: 'b', personnel_code: 'DD-001', full_name: 'Bình', role_type: 'nurse', phone_number: '090222', fixed_cost: 888888, email: '' },
];
const schedules = [
  { id: 'clinic', schedule_date: '2026-11-03', schedule_type: 'insite', branch_code: 'q1', provisional_cost: 0 },
  { id: 'onsite', schedule_date: '2026-11-09', schedule_type: 'onsite_exam', branch_code: 'q7', company_name: 'ABC', provisional_cost: 0 },
  { id: 'setup', schedule_date: '2026-11-08', schedule_type: 'onsite_setup', branch_code: 'q7', company_name: 'ABC', provisional_cost: 0 },
  { id: 'old', schedule_date: '2026-10-01', schedule_type: 'insite', branch_code: 'q1', provisional_cost: 0 },
];
const assignments = [
  { id: 'a1', personnel_id: 'a', schedule_id: 'clinic', base_cost_snapshot: 1000, allowance_cost: 100, shift_period: 'AM' },
  { id: 'a2', personnel_id: 'a', schedule_id: 'clinic', base_cost_snapshot: 2000, allowance_cost: 200, shift_period: 'PM' },
  { id: 'a3', personnel_id: 'a', schedule_id: 'onsite', base_cost_snapshot: 3000, allowance_cost: 300, shift_period: 'FULL' },
  { id: 'a4', personnel_id: 'b', schedule_id: 'setup', base_cost_snapshot: 4000, allowance_cost: 400, shift_period: 'FULL' },
  { id: 'a5', personnel_id: 'a', schedule_id: 'old', base_cost_snapshot: 5000, allowance_cost: 0, shift_period: 'FULL' },
];
const build = filters => buildSettlementRows(schedules, assignments, people, { month: '2026-11', ...filters });

test('settlement totals use saved assignment costs, count shifts and reconcile with details', () => {
  const rows = build();
  assert.equal(rows.length, 2);
  const an = rows.find(row => row.person.id === 'a');
  assert.equal(an.insiteCount, 2);
  assert.equal(an.onsiteCount, 1);
  assert.equal(an.shiftCount, 3);
  assert.equal(an.totalGrand, 6600);
  assert.deepEqual(an.entries.map(entry => entry.assignment.id), ['a1', 'a2', 'a3']);
  for (const row of rows) {
    assert.equal(row.totalBase + row.totalAllowance, row.totalGrand);
    assert.equal(row.entries.reduce((sum, { assignment }) => sum + assignment.base_cost_snapshot + assignment.allowance_cost, 0), row.totalGrand);
  }
});

test('settlement combines month, role, branch, workplace and search filters', () => {
  assert.equal(build({ branch: 'q7', location: 'onsite', role: 'doctor', query: '090111' })[0].totalGrand, 3300);
  assert.deepEqual(build({ branch: 'q1', location: 'onsite' }), []);
  assert.deepEqual(build({ role: 'nurse', query: 'An' }), []);
  assert.equal(build({ location: 'onsite' }).find(row => row.person.id === 'b').shiftCount, 1);
  assert.equal(build({ query: 'bs-001' }).length, 1);
  assert.deepEqual(buildSettlementRows(schedules, assignments, people, { month: '2026-12' }), []);
});

test('settlement sorts names, shifts and costs in both directions without mutating inputs', () => {
  const before = JSON.stringify(assignments);
  assert.deepEqual(build({ sortBy: 'name', sortDirection: 'asc' }).map(row => row.person.id), ['a', 'b']);
  assert.deepEqual(build({ sortBy: 'name', sortDirection: 'desc' }).map(row => row.person.id), ['b', 'a']);
  assert.deepEqual(build({ sortBy: 'shiftCount', sortDirection: 'asc' }).map(row => row.person.id), ['b', 'a']);
  assert.deepEqual(build({ sortBy: 'totalGrand', sortDirection: 'desc' }).map(row => row.person.id), ['a', 'b']);
  assert.equal(JSON.stringify(assignments), before);
});

test('filtered Excel matches table rows and totals; full-month Excel ignores table filters and includes planning sheets', () => {
  const xlsx = load('lib/xlsx.ts');
  const specialties = load('features/admin/roster/personnel/doctorSpecialties.ts');
  const service = load('features/admin/roster/data/rosterService.ts', { '../personnel/doctorSpecialties': specialties });
  let entries;
  const excel = load('features/admin/roster/shared/exportRosterExcel.ts', {
    '../settlement/settlementRows': rowsModule,
    '../data/rosterService': service,
    '../../../../lib/date': { getTodayInVietnam: () => '2026-11-17' },
    '../../shared/adminFormatters': { formatDisplayDate: date => date },
    '../../../../lib/xlsx': { ...xlsx, createZipArchive: value => { entries = value; return new Uint8Array(); } },
  });
  const previousDocument = global.document;
  const previousWindow = global.window;
  global.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
  global.window = { setTimeout: callback => callback() };
  try {
    const args = { monthStr: '2026-11', schedules, assignments, personnelList: people, roomMap: new Map() };
    excel.exportMonthlyPersonnelCostExcel({ ...args, filterBranch: 'q7', filterLocation: 'onsite', filterRole: 'doctor', scope: 'filtered' });
    const xml = file => {
      const entry = entries.find(entry => entry.name === file);
      return typeof entry.data === 'string' ? entry.data : new TextDecoder().decode(entry.data);
    };
    const summary = xml('xl/worksheets/sheet1.xml');
    assert.match(summary, /An/);
    assert.doesNotMatch(summary, /Bình/);
    assert.match(summary, /<v>3300<\/v>/);
    assert.ok(!entries.some(entry => entry.name === 'xl/worksheets/sheet3.xml'));
    assert.doesNotMatch(xml('xl/worksheets/sheet2.xml'), /2026-10-01/);
    excel.exportMonthlyPersonnelCostExcel(args);
    assert.match(xml('xl/worksheets/sheet1.xml'), /Bình/);
    assert.match(xml('xl/worksheets/sheet1.xml'), /<v>11000<\/v>/);
    assert.ok(entries.some(entry => entry.name === 'xl/worksheets/sheet4.xml'));
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});
