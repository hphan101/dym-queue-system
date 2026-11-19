const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'require', code)(exports, name => imports[name] ?? {});
  return exports;
}
const service = load('features/admin/roster/data/rosterService.ts');
const { buildCampaignSettlementRows } = load('features/admin/roster/settlement/campaignSettlementRows.ts', { '../data/rosterService': service });
const schedules = [
  { id: 'clinic', schedule_type: 'insite', schedule_date: '2026-11-03', provisional_cost: 900 },
  { id: 'blood', schedule_type: 'blood_draw', schedule_date: '2026-11-03', campaign_code: 'B', provisional_cost: 800 },
  { id: 'exam', schedule_type: 'onsite_exam', schedule_date: '2026-11-20', campaign_code: 'A', provisional_cost: 500 },
  { id: 'setup', schedule_type: 'setup', schedule_date: '2026-11-17', campaign_code: 'C', provisional_cost: 300 },
  { id: 'old', schedule_type: 'onsite_exam', schedule_date: '2026-10-03', provisional_cost: 700 },
];
const assignments = [
  { schedule_id: 'blood', personnel_id: 'a', base_cost_snapshot: '1000', allowance_cost: '100' },
  { schedule_id: 'blood', personnel_id: 'a', base_cost_snapshot: 2000, allowance_cost: 200 },
  { schedule_id: 'blood', personnel_id: 'b', base_cost_snapshot: 500, allowance_cost: null },
  { schedule_id: 'exam', personnel_id: 'a', base_cost_snapshot: 3000, allowance_cost: 300 },
  { schedule_id: 'clinic', personnel_id: 'a', base_cost_snapshot: 9999, allowance_cost: 0 },
  { schedule_id: 'missing', personnel_id: 'a', base_cost_snapshot: 9999, allowance_cost: 0 },
];
test('campaign settlement uses saved costs, unique personnel, and excludes clinic/outside month/orphan assignments', () => {
  const before = JSON.stringify([schedules, assignments]);
  const rows = buildCampaignSettlementRows(schedules, assignments, '2026-11', '2026-11-17');
  assert.deepEqual(rows.map(row => row.schedule.id), ['blood', 'setup', 'exam']);
  assert.equal(rows[0].personnelCount, 2);
  assert.equal(rows[0].baseCost, 3500);
  assert.equal(rows[0].allowanceCost, 300);
  assert.equal(rows[0].totalCost, 3800);
  for (const row of rows) {
    assert.ok(row.entries.every(entry => entry.schedule_id === row.schedule.id));
    assert.equal(row.entries.reduce((sum, entry) => sum + Number(entry.base_cost_snapshot ?? 0) + Number(entry.allowance_cost ?? 0), 0), row.totalCost);
  }
  assert.equal(rows.reduce((sum, row) => sum + row.totalCost, 0), 7100);
  assert.equal(JSON.stringify([schedules, assignments]), before);
});
test('reserve is separate, only counted today/future, and unassigned campaigns remain visible', () => {
  const rows = buildCampaignSettlementRows(schedules, assignments, '2026-11', '2026-11-17');
  assert.equal(rows[0].reserve, 0);
  assert.equal(rows[1].reserve, 300);
  assert.equal(rows[1].personnelCount, 0);
  assert.equal(rows[1].totalCost, 0);
  assert.equal(rows[2].totalCost, 3300);
  assert.equal(rows[2].reserve, 500);
  assert.deepEqual(buildCampaignSettlementRows(schedules, assignments, '2026-12', '2026-11-17'), []);
});

test('campaign Excel exports exactly the supplied filtered rows, numeric totals, and safe text', () => {
  let entries, filename;
  const xlsx = load('lib/xlsx.ts');
  const excel = load('features/admin/roster/shared/exportRosterExcel.ts', {
    '../data/shiftTime': load('features/admin/roster/data/shiftTime.ts'),
    '../data/rosterService': service,
    '../../shared/adminFormatters': { formatDisplayDate: date => date },
    '../../../../lib/xlsx': { ...xlsx, createZipArchive: value => { entries = value; return new Uint8Array(); } },
  });
  const savedDocument = global.document, savedWindow = global.window;
  global.document = { createElement: () => ({ click() { filename = this.download; } }), body: { appendChild() {}, removeChild() {} } };
  global.window = { setTimeout: callback => callback() };
  try {
    const rows = buildCampaignSettlementRows(schedules.map(s => ({ ...s, branch_code: 'q7', company_name: '=UNTRUSTED & Co' })), assignments, '2026-11', '2026-11-17');
    excel.exportCampaignSettlementExcel('2026-11', rows.filter(row => row.schedule.schedule_type === 'onsite_exam'));
    const xml = new TextDecoder().decode(entries.find(entry => entry.name === 'xl/worksheets/sheet1.xml').data);
    assert.match(filename, /Chi-Phi-Doan_2026-11_Dang-loc\.xlsx/);
    assert.match(xml, /&apos;=UNTRUSTED &amp; Co/);
    assert.match(xml, /Onsite HC/);
    assert.doesNotMatch(xml, /Blood sampling/);
    assert.match(xml, /<c r="I4" s="4" t="n"><v>3300<\/v>/);
    assert.match(xml, /<c r="J5" s="6" t="n"><v>500<\/v>/);
    excel.exportCampaignSettlementExcel('2026-11', rows, 'month');
    assert.equal(filename, 'Chi-Phi-Doan_2026-11.xlsx');
    const allXml = new TextDecoder().decode(entries.find(entry => entry.name === 'xl/worksheets/sheet1.xml').data);
    assert.match(allXml, /Blood sampling/);
    assert.match(allXml, /Onsite set-up/);
  } finally { global.document = savedDocument; global.window = savedWindow; }
});
