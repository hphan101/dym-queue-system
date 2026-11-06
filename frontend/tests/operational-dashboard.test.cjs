const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.resolve(__dirname, '../src/features/admin/roster');
function load(file, imports) {
  const result = {};
  const source = fs.readFileSync(path.join(directory, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(result, name => imports[name] ?? {});
  return result;
}
const service = load('rosterService.ts', { '../../../lib/supabaseClient': { supabase: {} } });
const week = load('insiteWeek.ts', { './rosterService': service });
const model = load('dashboardSummary.ts', { './rosterService': service, './insiteWeek': week });
const schedule = (id, date, type = 'onsite_exam', branch = 'q1', extra = {}) => ({ id, schedule_date: date, schedule_type: type, branch_code: branch, company_name: id, position_list: ['Nội', 'Siêu âm'], provisional_cost: 100, created_at: '2026-11-01', ...extra });
const assignment = (id, scheduleId, person, shift = 'FULL', extra = {}) => ({ id, schedule_id: scheduleId, personnel_id: person, position_label: 'Nội', shift_period: shift, base_cost_snapshot: 1000, allowance_cost: 200, created_at: '2026-11-01', sort_order: 0, ...extra });

test('dashboard counts positions, unique personnel and conflicts without treating AM + PM as overlap', () => {
  const schedules = [schedule('clinic', '2026-11-30', 'insite'), schedule('hc', '2026-11-30'), schedule('blood', '2026-11-30', 'blood_draw', 'q7')];
  const assignments = [assignment('a', 'clinic', 'one', 'AM', { room_id: 'r1' }), assignment('b', 'hc', 'one', 'PM'), assignment('c', 'blood', 'two'), assignment('d', 'hc', 'two'), assignment('e', 'hc', 'three', 'FULL', { position_label: 'Siêu âm' })];
  const rooms = [{ id: 'r1', branch_code: 'q1', room_name: 'Nội', is_active: true, inactive_from: null, display_order: 0 }, { id: 'r2', branch_code: 'q1', room_name: 'Ẩn', is_active: true, inactive_from: null, display_order: 1 }];
  const dailyRoomOverrides = [{ id: 'hide', branch_code: 'q1', schedule_date: '2026-11-30', override_type: 'hide', room_id: 'r2' }, { id: 'add', branch_code: 'q1', schedule_date: '2026-11-30', override_type: 'add', custom_room_name: 'Thêm', display_order: 3 }];
  const summary = model.buildDashboardSummary({ schedules, assignments, dailyRoomOverrides }, rooms, '2026-11-30', 'all', '2026-11-30');
  assert.equal(summary.rooms, 2);
  assert.equal(summary.staffed, 1);
  assert.equal(summary.personnel, 3);
  assert.equal(summary.dailyCampaigns.length, 2);
  assert.equal(summary.dailyCampaigns.find(item => item.schedule.id === 'hc').filled, 2);
  assert.equal(summary.missing, 2);
  assert.deepEqual(summary.conflicts.map(item => item.personnelId), ['two']);
  const q1 = model.buildDashboardSummary({ schedules, assignments, dailyRoomOverrides }, rooms, '2026-11-30', 'q1', '2026-11-30');
  assert.deepEqual(q1.conflicts.map(item => item.personnelId), ['two'], 'filtering a branch must still detect a cross-branch clash');
});

test('upcoming crosses months while weekly counts and money remain in the selected month; actual excludes reserves', () => {
  const schedules = [schedule('old', '2026-11-29'), schedule('today', '2026-11-30'), schedule('next', '2026-12-01', 'setup', 'q7', { position_list: [], setup_onsite_ids: [] }), schedule('outside', '2026-12-07')];
  const assignments = [assignment('a', 'old', 'one'), assignment('b', 'today', 'two'), assignment('c', 'next', 'three')];
  const summary = model.buildDashboardSummary({ schedules, assignments, dailyRoomOverrides: [] }, [], '2026-11-30', 'all', '2026-11-30');
  assert.deepEqual(summary.upcoming.map(item => item.schedule.id), ['today', 'next']);
  assert.equal(summary.monthlyCampaignCount, 2);
  assert.equal(summary.weeks.reduce((sum, item) => sum + item.onsite_exam + item.blood_draw + item.setup, 0), 2);
  assert.equal(summary.weeks[0].start, '2026-11-01');
  assert.equal(summary.weeks.at(-1).end, '2026-11-30');
  assert.equal(summary.reserve, 100);
  assert.equal(summary.forecast, 2500);
  assert.equal(summary.actual, 1200);
  assert.equal(summary.unlinked[0].schedule.id, 'next');
  assert.equal(summary.unconfigured[0].schedule.id, 'next');
  const empty = model.buildDashboardSummary({ schedules: [], assignments: [], dailyRoomOverrides: [] }, [], '2026-12-31', 'all', '2026-11-30');
  assert.equal(empty.forecast, 0);
  assert.equal(empty.missing, 0);
  assert.equal(empty.weeks.reduce((sum, item) => sum + item.setup, 0), 0);
});

test('dashboard fetch paginates beyond 1000 assignments, batches schedule IDs and propagates errors', async () => {
  const schedules = Array.from({ length: 101 }, (_, i) => schedule(`s${i}`, '2026-11-30'));
  const assignments = Array.from({ length: 1205 }, (_, i) => assignment(`a${i}`, `s${i % 101}`, `p${i}`));
  const ranges = [], batches = [];
  let fail = false;
  const client = { from(table) {
    let rows = table === 'roster_schedules' ? schedules : table === 'roster_assignments' ? assignments : [];
    return { select() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; },
      in(_key, ids) { batches.push(ids.length); rows = rows.filter(item => ids.includes(item.schedule_id)); return this; },
      async range(start, end) { ranges.push([table, start, end]); return { data: rows.slice(start, end + 1), error: fail ? { message: 'Offline' } : null }; },
    };
  } };
  const api = load('rosterService.ts', { '../../../lib/supabaseClient': { supabase: client } });
  const result = await api.fetchRosterBundleForRange('2026-11-01', '2026-12-06');
  assert.equal(result.schedules.length, 101);
  assert.equal(result.assignments.length, 1205);
  assert.equal(new Set(result.assignments.map(item => item.id)).size, 1205);
  assert.ok(batches.every(size => size <= 100));
  assert.ok(ranges.some(([table, start]) => table === 'roster_assignments' && start === 1000));
  fail = true;
  await assert.rejects(api.fetchRosterBundleForRange('2026-11-01', '2026-12-06'), /Offline/);
});

test('deep links open exact campaign/category and day, reject invalid dates and respond to later navigation', () => {
  const listeners = new Map();
  let cleanup;
  const destination = model.dashboardHref('roster-onsite', '2026-12-01', 'q7', 'campaign-id', 'blood_draw');
  global.window = { location: { search: destination.slice(2) }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  try {
    const api = load('useRosterDeepLink.ts', { react: { useRef: current => ({ current }), useEffect: callback => { cleanup = callback(); } }, '../../../lib/navigation': { APP_NAVIGATION_EVENT: 'navigate' } });
    const seen = [];
    api.useRosterDeepLink('roster-onsite', value => seen.push(value));
    assert.equal(seen[0].campaign, 'campaign-id');
    assert.equal(seen[0].type, 'blood_draw');
    assert.equal(seen[0].branch, 'q7');
    window.location.search = '?page=roster-onsite&branch=q1&date=2027-01-01&campaign=other';
    listeners.get('navigate')();
    assert.equal(seen[1].campaign, 'other');
    assert.equal(api.readRosterDeepLink('?page=roster-onsite&branch=q1&date=2026-02-30', 'roster-onsite'), null);
    assert.equal(api.readRosterDeepLink('?page=roster-onsite&branch=hn&date=2026-11-05', 'roster-onsite'), null);
    assert.equal(new URL(model.dashboardHref('roster-insite', '2026-11-05', 'q1'), 'http://localhost').searchParams.get('view'), 'day');
    cleanup();
    assert.equal(listeners.size, 0);
  } finally { delete global.window; }
});
