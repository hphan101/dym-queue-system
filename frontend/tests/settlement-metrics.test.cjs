const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src/features/admin/roster');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('exports', 'require', code)(exports, key => imports[key] ?? {});
  return exports;
}
const specialties = load('personnel/doctorSpecialties.ts');
const service = load('data/rosterService.ts', { '../personnel/doctorSpecialties': specialties });
const { buildSettlementMetrics } = load('settlement/settlementMetrics.ts', { '../data/rosterService': service });
const schedule = (id, date, reserve = 0) => ({ id, schedule_date: date, schedule_type: 'insite', provisional_cost: reserve });
const assignment = (scheduleId, person, base, allowance = 0) => ({ schedule_id: scheduleId, personnel_id: person, base_cost_snapshot: base, allowance_cost: allowance });

test('settlement cards reconcile daily costs, ignore old reserves and deduplicate personnel', () => {
  const result = buildSettlementMetrics([
    schedule('past', '2026-11-10', 999),
    schedule('today', '2026-11-17', 500),
    schedule('future', '2026-11-20', 800),
    schedule('other-month', '2026-10-10', 900),
  ], [
    assignment('past', 'a', 1000, 100),
    assignment('past', 'a', 2000, 200),
    assignment('today', 'a', 3000),
    assignment('future', 'b', 4000, 400),
    assignment('other-month', 'c', 9000),
    assignment('missing', 'd', 9000),
  ], '2026-11', '2026-11-17');
  assert.deepEqual(result.totals, { forecast: 12000, actual: 3300, reserve: 1300, personnel: 2 });
  assert.equal(result.days.length, 30);
  assert.deepEqual(result.days[9], { date: '2026-11-10', forecast: 3300, actual: 3300, reserve: 0, personnel: 1 });
  assert.deepEqual(result.days[16], { date: '2026-11-17', forecast: 3500, actual: null, reserve: 500, personnel: 1 });
  assert.deepEqual(result.days[19], { date: '2026-11-20', forecast: 5200, actual: null, reserve: 800, personnel: 1 });
  for (const key of ['forecast', 'actual', 'reserve']) {
    assert.equal(result.days.reduce((sum, day) => sum + (day[key] ?? 0), 0), result.totals[key]);
  }
});

test('empty and leap-year months have complete zero-filled date series', () => {
  const result = buildSettlementMetrics([], [], '2024-02', '2026-11-17');
  assert.equal(result.days.length, 29);
  assert.equal(result.days.at(-1).date, '2024-02-29');
  assert.deepEqual(result.totals, { forecast: 0, actual: 0, reserve: 0, personnel: 0 });
  assert.ok(result.days.every(day => day.actual === 0));
  const future = buildSettlementMetrics([], [], '2026-12', '2026-11-17');
  assert.ok(future.days.every(day => day.actual === null));
});

test('actual-cost sparkline spans elapsed days without adding future actual costs', () => {
  const chart = load('settlement/SettlementMetricCards.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: { useState: initial => [typeof initial === 'function' ? false : initial], useId: () => 'test', useEffect() {} },
    recharts: { Area: 'Area', AreaChart: 'AreaChart' },
  });
  const data = buildSettlementMetrics([schedule('past', '2026-11-10')], [assignment('past', 'a', 1000)], '2026-11', '2026-11-17');
  const content = chart.SettlementMetricCards({ data, month: '2026-11', isLoading: false, isActiveTab: true });
  const tree = content.type(content.props);
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  const nodes = elements(tree);
  const charts = nodes.filter(node => node.type === 'AreaChart');
  assert.equal(charts.length, 4);
  assert.equal(charts[0].props.data.length, 30);
  assert.equal(charts[1].props.data.length, 16);
  assert.equal(charts[1].props.data.at(-1).date, '2026-11-16');
  assert.ok(charts[1].props.data.every(day => day.actual !== null));
  for (const area of nodes.filter(node => node.type === 'Area')) {
    assert.equal(area.props.strokeWidth, 3);
    assert.equal(area.props.isAnimationActive, false);
  }
  assert.equal(tree.props['data-motion'], 'pending');
  assert.equal(nodes.filter(node => typeof node.props?.onResize === 'function').length, 4);
  assert.ok(data.days.slice(16).every(day => day.actual === null));
});

test('metric cards restart their animation state on tab activation, month change and load completion', () => {
  const chart = load('settlement/SettlementMetricCards.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') });
  const props = { data: buildSettlementMetrics([], [], '2026-11', '2026-11-17'), month: '2026-11', isLoading: false, isActiveTab: true };
  const key = chart.SettlementMetricCards(props).key;
  assert.notEqual(chart.SettlementMetricCards({ ...props, isActiveTab: false }).key, key);
  assert.notEqual(chart.SettlementMetricCards({ ...props, isLoading: true }).key, key);
  assert.notEqual(chart.SettlementMetricCards({ ...props, month: '2026-12' }).key, key);
});
