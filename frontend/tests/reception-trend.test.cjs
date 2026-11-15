const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/roster/dashboard/receptionTrend.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports_ = {};
new Function('exports', code)(exports_);
const { buildReceptionTrend } = exports_;

test('daily reception trend fills missing days, leap days and caps the current month at today', () => {
  const rows = [{ queue_date: '2024-02-01', total: 3 }, { queue_date: '2024-02-29', total: 5 }, { queue_date: '2023-02-01', total: 99 }];
  let points = buildReceptionTrend(rows, '2024-02-15', 'daily', '2026-11-15');
  assert.equal(points.length, 29);
  assert.equal(points[0].count, 3);
  assert.equal(points[1].count, 0);
  assert.equal(points.at(-1).count, 5);
  assert.equal(points.at(-1).fullLabel, '29/02/2024');
  assert.equal(buildReceptionTrend([], '2025-02-01', 'daily', '2026-11-15').length, 28);
  points = buildReceptionTrend([{ queue_date: '2026-11-16', total: 20 }], '2026-11-01', 'daily', '2026-11-15');
  assert.equal(points.length, 15);
  assert.ok(points.every((point) => point.count === 0));
  assert.deepEqual(buildReceptionTrend([], '2026-12-01', 'daily', '2026-11-15'), []);
});

test('monthly reception totals match the daily counts and omit future months', () => {
  const rows = [{ queue_date: '2026-01-01', total: 4 }, { queue_date: '2026-01-31', total: 2 }, { queue_date: '2026-11-15', total: 7 }, { queue_date: '2026-11-16', total: 100 }];
  const points = buildReceptionTrend(rows, '2026-11-01', 'monthly', '2026-11-15');
  assert.equal(points.length, 11);
  assert.equal(points[0].count, 6);
  assert.equal(points[1].count, 0);
  assert.equal(points.at(-1).count, 7);
  assert.equal(points.reduce((sum, point) => sum + point.count, 0), 13);
  assert.equal(buildReceptionTrend([], '2025-02-01', 'monthly', '2026-11-15').length, 12);
  assert.deepEqual(buildReceptionTrend([], '2027-02-01', 'monthly', '2026-11-15'), []);
});
