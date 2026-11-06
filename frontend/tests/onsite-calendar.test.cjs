const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.resolve(__dirname, '../src/features/admin/roster');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('exports', 'require', code)(exports, (name) => imports[name] ?? {});
  return exports;
}
const model = load('onsiteCalendar.ts');
const specialties = load('doctorSpecialties.ts');
const service = load('rosterService.ts', { './doctorSpecialties': specialties, '../../../lib/supabaseClient': { supabase: {} } });
const week = load('insiteWeek.ts', { './rosterService': service });
const input = { schedule_type: 'blood_draw', branch_code: 'q1', schedule_date: '2026-11-05', campaign_code: 'DOAN-20261105-001', company_name: ' DYM ', contact_person: '', company_address: '', notes: '', position_list: ['Lấy mẫu', 'Hỗ trợ riêng'], default_allowance: 100000, sales_person: 'Sales A', departure_address: '39 Lê Duẩn' };

test('multiple days are sorted, deduplicated and receive daily codes while retaining company and position data', () => {
  const result = model.buildMultiDayCampaigns(input, ['2026-12-02', '2026-11-05', '2026-11-05']);
  assert.deepEqual(result.map((item) => item.schedule_date), ['2026-11-05', '2026-12-02']);
  assert.deepEqual(result.map((item) => item.campaign_code), ['DOAN-20261105-001', 'DOAN-20261202-001']);
  assert.ok(result.every((item) => item.company_name === input.company_name && item.id === null && item.sales_person === input.sales_person && item.departure_address === input.departure_address));
  assert.deepEqual(result[1].position_list, input.position_list);
  assert.equal(input.schedule_date, '2026-11-05');
  assert.deepEqual(model.buildMultiDayCampaigns({ ...input, campaign_code: 'CUSTOM' }, ['2026-11-05', '2026-11-08']).map((item) => item.campaign_code), ['CUSTOM', 'CUSTOM-20261108']);
  for (const dates of [[], ['2026-02-30'], ['not-a-date'], ['2026-2-05']]) assert.throws(() => model.buildMultiDayCampaigns(input, dates));
});

test('multi-day creation uses a single batch insert, preserves validation and propagates database errors', async () => {
  let writes = 0, payloads, fail = false;
  const api = load('rosterService.ts', { './doctorSpecialties': specialties, '../../../lib/supabaseClient': { supabase: {
    from(table) { assert.equal(table, 'roster_schedules'); return {
      insert(payload) { writes++; payloads = payload; return this; },
      async select() { return fail ? { error: { message: 'History locked' } } : { data: payloads.map((row, index) => ({ id: `${index}`, ...row })) }; },
    }; },
  } } });
  const inputs = model.buildMultiDayCampaigns(input, ['2026-11-05', '2026-11-08']);
  const saved = await api.createOnsiteSchedules(inputs);
  assert.equal(writes, 1);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].campaign_group_id, payloads[1].campaign_group_id);
  assert.match(payloads[0].campaign_group_id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(payloads[1].company_name, 'DYM');
  assert.deepEqual(payloads[1].position_list, input.position_list);
  assert.equal(saved[1].schedule_date, '2026-11-08');
  fail = true;
  await assert.rejects(api.createOnsiteSchedules(inputs), /History locked/);
  const before = writes;
  await assert.rejects(api.createOnsiteSchedules([{ ...inputs[0], sales_person: 'x'.repeat(256) }]));
  await assert.rejects(api.createOnsiteSchedules([{ ...inputs[0], id: 'existing' }]));
  await assert.rejects(api.createOnsiteSchedules([]));
  assert.equal(writes, before);
});

test('weekly campaigns respect exact days, branch, type and cross-month boundaries without clinic rows', async () => {
  const dates = week.getInsiteWeekDates('2026-11-01');
  const schedules = [
    { id: 'blood', schedule_date: '2026-10-31', branch_code: 'q1', schedule_type: 'blood_draw', company_name: 'B' },
    { id: 'hc', schedule_date: '2026-11-01', branch_code: 'q1', schedule_type: 'onsite_exam', company_name: 'A' },
    { id: 'setup', schedule_date: '2026-11-01', branch_code: 'q1', schedule_type: 'setup', company_name: 'B' },
    { id: 'clinic', schedule_date: '2026-11-01', branch_code: 'q1', schedule_type: 'insite' },
    { id: 'other', schedule_date: '2026-11-01', branch_code: 'q7', schedule_type: 'blood_draw' },
    { id: 'outside', schedule_date: '2026-11-02', branch_code: 'q1', schedule_type: 'blood_draw' },
  ];
  const days = model.groupOnsiteWeek(dates, 'q1', schedules);
  assert.equal(days.size, 7);
  assert.deepEqual(days.get('2026-10-31').map((item) => item.id), ['blood']);
  assert.deepEqual(days.get('2026-11-01').map((item) => item.id), ['hc', 'setup']);
  assert.deepEqual(days.get(dates[0]), []);
  assert.deepEqual(model.groupOnsiteWeek(dates, 'q1', schedules, 'blood_draw').get('2026-11-01'), []);
  const filters = [];
  const query = { select() { return this; }, neq(...args) { filters.push(['neq', ...args]); return this; }, gte(...args) { filters.push(['gte', ...args]); return this; }, lte(...args) { filters.push(['lte', ...args]); return Promise.resolve({ data: schedules }); } };
  const api = load('onsiteCalendar.ts', { './rosterService': service, '../../../lib/supabaseClient': { supabase: { from: () => query } } });
  await api.fetchOnsiteWeek(dates[0], dates[6]);
  assert.deepEqual(filters, [['neq', 'schedule_type', 'insite'], ['gte', 'schedule_date', '2026-10-26'], ['lte', 'schedule_date', '2026-11-01']]);
});

test('creating HC together with setup uses one transactional RPC and preserves setup dates and positions', async () => {
  let call, fail = false;
  const api = load('rosterService.ts', { './doctorSpecialties': specialties, '../../../lib/supabaseClient': { supabase: {
    async rpc(name, args) { call = { name, args }; return fail ? { error: { message: 'History locked' } } : { data: [...args.p_hc, ...args.p_setup] }; },
  } } });
  const hc = model.buildMultiDayCampaigns({ ...input, schedule_type: 'onsite_exam' }, ['2026-11-10', '2026-11-11']);
  const setups = model.buildMultiDayCampaigns({ ...input, schedule_type: 'setup', campaign_code: 'SETUP', position_list: ['Chuẩn bị bàn'] }, ['2026-11-09']);
  const saved = await api.createOnsiteSchedules(hc, setups);
  assert.equal(call.name, 'create_onsite_with_setup');
  assert.equal(call.args.p_hc.length, 2);
  assert.equal(call.args.p_setup[0].schedule_date, '2026-11-09');
  assert.deepEqual(call.args.p_setup[0].position_list, ['Chuẩn bị bàn']);
  assert.equal(saved.length, 3);
  fail = true;
  await assert.rejects(api.createOnsiteSchedules(hc, setups), /History locked/);
  await assert.rejects(api.createOnsiteSchedules(hc, []));
  await assert.rejects(api.createOnsiteSchedules([{ ...hc[0], schedule_type: 'blood_draw' }], setups));
});

test('calendar opens the exact campaign and hides stale events after week/branch/refresh changes', () => {
  const dates = week.getInsiteWeekDates('2026-11-05');
  const campaign = { id: 'target', schedule_date: dates[0], branch_code: 'q1', schedule_type: 'blood_draw', company_name: 'DYM', campaign_code: 'CODE', provisional_cost: 9999999 };
  const requestKey = `${dates[0]}:${dates[6]}:q1:0:0`;
  let index = 0;
  const react = { useState(initial) { return [index++ === 0 ? { key: requestKey, campaigns: [campaign] } : initial, () => {}]; }, useEffect() {} };
  const context = { selectedBranch: 'q1', setSelectedBranch() {}, canEditHistory: false };
  const imports = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), '../../../lib/date': { getTodayInVietnam: () => '2026-11-05' },
    '../utils/adminFormatters': { formatDisplayDate: (date) => date.split('-').reverse().join('/') },
    './insiteWeek': week, './onsiteCalendar': model, './rosterService': service,
    './useRosterData': { useRosterData: () => context },
  };
  const { RosterOnsiteWeek } = load('RosterOnsiteWeek.tsx', imports);
  let opened, createDate;
  const props = { date: '2026-11-05', type: 'all', refreshKey: 0, onDateChange() {}, onTypeChange() {}, onOpenCampaign: (value) => { opened = value; }, onCreateCampaign: (date) => { createDate = date; } };
  function render(overrides = {}) { index = 0; return RosterOnsiteWeek({ ...props, ...overrides }); }
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const tree = render();
  elements(tree).find((node) => node.props?.className === 'dym-onsite-calendar-event').props.onClick();
  assert.equal(opened, campaign);
  const add = elements(tree).find((node) => node.props?.['aria-label'] === 'Thêm đoàn ngày 06/11/2026');
  assert.equal(add.props.disabled, false);
  add.props.onClick();
  assert.equal(createDate, '2026-11-06');
  assert.equal(elements(tree).find((node) => node.props?.['aria-label'] === 'Thêm đoàn ngày 02/11/2026').props.disabled, true);
  context.canEditHistory = true;
  const addPast = elements(render()).find((node) => node.props?.['aria-label'] === 'Thêm đoàn ngày 02/11/2026');
  assert.equal(addPast.props.disabled, false);
  addPast.props.onClick();
  assert.equal(createDate, '2026-11-02');
  assert.doesNotMatch(JSON.stringify(tree), /Phòng khám|ca trực|9999999/);
  for (const changes of [{ date: '2026-11-12' }, { refreshKey: 1 }]) assert.equal(elements(render(changes)).some((node) => node.props?.className === 'dym-onsite-calendar-event'), false);
  context.selectedBranch = 'q7';
  assert.equal(elements(render()).some((node) => node.props?.className === 'dym-onsite-calendar-event'), false);
});

test('date picker keeps multiple nonconsecutive days selected while the single-date calendar stays unchanged', () => {
  const react = { useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useMemo: (fn) => fn(), useEffect() {} };
  const imports = { react, 'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/date': { getTodayInVietnam: () => '2026-11-05' }, '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') } };
  const { Calendar } = load('../../../components/ui/calendar.tsx', imports);
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const nodes = elements(Calendar({ selected: '2026-11-05', selectedDates: ['2026-11-05', '2026-11-08'], showDateInput: false }));
  assert.equal(nodes.find((node) => node.props?.['aria-label'] === '05/11/2026').props['aria-pressed'], true);
  assert.equal(nodes.find((node) => node.props?.['aria-label'] === '08/11/2026').props['aria-pressed'], true);
  assert.equal(nodes.find((node) => node.props?.['aria-label'] === '06/11/2026').props['aria-pressed'], false);
  assert.equal(nodes.some((node) => node.props?.placeholder?.includes('DD/MM/YYYY')), false);
  const single = elements(Calendar({ selected: '2026-11-05' }));
  assert.match(single.find((node) => node.props?.['aria-label'] === '05/11/2026').props.className, /bg-primary/);
  let changed;
  const { MultiDatePicker } = load('../../../components/ui/multi-date-picker.tsx', imports);
  const picker = elements(MultiDatePicker({ value: ['2026-11-05'], onChange: (value) => { changed = value; } }));
  picker.find((node) => node.props?.selectedDates).props.onSelect('2026-11-08');
  assert.deepEqual(changed, ['2026-11-05', '2026-11-08']);
  picker.find((node) => node.props?.selectedDates).props.onSelect('2026-11-05');
  assert.deepEqual(changed, []);
});
