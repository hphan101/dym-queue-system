const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const result = {};
const source = fs.readFileSync(path.join(__dirname, '../src/features/admin/roster/dashboardSummary.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function('exports', 'require', code)(result, () => ({}));

test('weekly chart uses an integer axis with headroom and a stable scale for empty months', () => {
  for (const peak of [0, 1, 4, 5, 19, 100, 1500]) {
    const { maximum, ticks } = result.getWeeklyChartScale(peak);
    assert.ok(maximum >= peak && maximum >= 4);
    assert.equal(ticks[0], maximum);
    assert.equal(ticks.at(-1), 0);
    assert.ok(ticks.every(Number.isInteger));
    assert.ok(ticks.length >= 3 && ticks.length <= 5);
    for (let index = 1; index < ticks.length; index++) assert.equal(ticks[index - 1] - ticks[index], ticks[0] - ticks[1]);
  }
  assert.deepEqual(result.getWeeklyChartScale(4).ticks, [4, 3, 2, 1, 0]);
  assert.deepEqual(result.getWeeklyChartScale(5).ticks, [6, 4, 2, 0]);
});
