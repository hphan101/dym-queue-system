const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.resolve(__dirname, '../src/features/admin/roster');
function load(file, imports) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(result, () => imports);
  return result;
}
const service = load('rosterService.ts', { supabase: {} });
const { getInsiteWeekDates, buildInsiteWeek } = load('insiteWeek.ts', service);

test('weeks run Monday to Sunday across month/year boundaries without timezone shifts', () => {
  const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  assert.deepEqual(getInsiteWeekDates('2026-11-01'), week);
  assert.deepEqual(getInsiteWeekDates('2026-10-26'), week);
  assert.deepEqual(getInsiteWeekDates('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('weekly rooms respect branch, date overrides, deactivation and insite-only assignments', () => {
  const dates = getInsiteWeekDates('2026-11-03');
  const rooms = [
    { id: 'r1', branch_code: 'q1', room_name: 'Khám nội', display_order: 1, is_active: true },
    { id: 'r2', branch_code: 'q1', room_name: 'Siêu âm', display_order: 2, is_active: true, inactive_from: dates[2] },
    { id: 'r3', branch_code: 'q7', room_name: 'D7', display_order: 0, is_active: true },
  ];
  const overrides = [
    { id: 'hide', branch_code: 'q1', schedule_date: dates[1], override_type: 'hide', room_id: 'r1' },
    { id: 'temp', branch_code: 'q1', schedule_date: dates[1], override_type: 'add', custom_room_name: 'Phòng bổ sung', display_order: 3 },
  ];
  const schedules = [
    { id: 's1', branch_code: 'q1', schedule_date: dates[0], schedule_type: 'insite' },
    { id: 's2', branch_code: 'q1', schedule_date: dates[1], schedule_type: 'insite' },
    { id: 's3', branch_code: 'q1', schedule_date: dates[0], schedule_type: 'onsite_exam' },
    { id: 's4', branch_code: 'q7', schedule_date: dates[0], schedule_type: 'insite' },
  ];
  const assignments = [
    { id: 'am', schedule_id: 's1', room_id: 'r1', shift_period: 'AM' },
    { id: 'pm', schedule_id: 's1', room_id: 'r1', shift_period: 'PM' },
    { id: 'temp', schedule_id: 's2', daily_override_id: 'temp', shift_period: 'FULL' },
    { id: 'onsite', schedule_id: 's3', room_id: 'r1' },
    { id: 'other-branch', schedule_id: 's4', room_id: 'r1' },
  ];
  const rows = buildInsiteWeek(dates, 'q1', rooms, overrides, schedules, assignments);
  assert.deepEqual(rows.map((row) => row.key), ['room:r1', 'room:r2', 'override:temp']);
  assert.deepEqual(rows[0].days.get(dates[0]).map((item) => item.id), ['am', 'pm']);
  assert.equal(rows[0].days.has(dates[1]), false);
  assert.deepEqual(rows[0].days.get(dates[2]), []);
  assert.equal(rows[1].days.has(dates[2]), false);
  assert.equal(rows[2].days.size, 1);
  assert.equal(rows[2].days.get(dates[1])[0].id, 'temp');
});

test('range loading requests both ends of a cross-month week, while monthly callers keep their range', async () => {
  const calls = [];
  const supabase = { from(table) {
    const query = {
      select() { return this; },
      gte(column, date) { calls.push([table, 'gte', column, date]); return this; },
      lte(column, date) { calls.push([table, 'lte', column, date]); return this; },
      order() { return this; },
      range() { return this; },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return query;
  } };
  const api = load('rosterService.ts', { supabase });
  await api.fetchRosterBundleForRange('2026-10-26', '2026-11-01');
  for (const table of ['roster_schedules', 'roster_daily_room_overrides']) {
    assert.ok(calls.some((row) => row[0] === table && row[1] === 'gte' && row[3] === '2026-10-26'));
    assert.ok(calls.some((row) => row[0] === table && row[1] === 'lte' && row[3] === '2026-11-01'));
  }
  calls.length = 0;
  await api.fetchRosterBundleForMonth('2026-11');
  assert.equal(calls[0][3], '2026-11-01');
  assert.equal(calls[1][3], '2026-11-30');
});

test('the week view hides previous data when the date, branch or refresh changes', () => {
  const code = ts.transpileModule(fs.readFileSync(path.join(directory, 'RosterInsiteWeek.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const cached = { key: '2026-11-02-2026-11-08-q1-0-0', value: { schedules: [], assignments: [], dailyRoomOverrides: [] } };
  function render(date, branch, refreshKey) {
    const state = [cached, null, 0];
    const result = {};
    new Function('exports', 'require', code)(result, (name) => {
      if (name === 'react') return { useState: () => [state.shift(), () => {}], useEffect: () => {} };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === './rosterService') return service;
      if (name === './insiteWeek') return { getInsiteWeekDates, buildInsiteWeek };
      if (name === './useRosterData') return { useRosterData: () => ({ selectedBranch: branch, setSelectedBranch() {}, roomsList: [], personnelMap: new Map(), isLoading: false }) };
      if (name.includes('lib/date')) return { getTodayInVietnam: () => '2026-11-03' };
      if (name.includes('adminFormatters')) return { formatDisplayDate: (value) => value };
      return new Proxy({}, { get: () => () => null });
    });
    return result.RosterInsiteWeek({ date, refreshKey, onDateChange() {}, onOpenDay() {} });
  }
  function hasClass(node, className) {
    if (!node || typeof node !== 'object') return false;
    if (node.props?.className?.split(' ').includes(className)) return true;
    return [node.props?.children].flat(Infinity).some((child) => hasClass(child, className));
  }
  assert.equal(hasClass(render('2026-11-03', 'q1', 0), 'dym-week-content'), true);
  for (const props of [['2026-11-10', 'q1', 0], ['2026-11-03', 'q7', 0], ['2026-11-03', 'q1', 1]]) {
    const view = render(...props);
    assert.equal(hasClass(view, 'dym-week-content'), false);
    assert.equal(hasClass(view, 'dym-week-loading'), true);
  }
});
