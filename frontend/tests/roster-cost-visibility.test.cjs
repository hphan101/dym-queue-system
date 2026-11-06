const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.resolve(__dirname, '../src/features/admin/roster');
function compile(file, requireForTest) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('exports', 'require', code)(result, requireForTest);
  return result;
}
const specialties = compile('doctorSpecialties.ts', () => ({}));
const campaignGroups = compile('campaignGroups.ts', () => ({}));
const positionOrder = compile('campaignPositionOrder.ts', () => ({}));
const service = compile('rosterService.ts', (name) => name === './doctorSpecialties' ? specialties : { supabase: {} });
const templates = compile('campaignTemplates.ts', (name) => name === './rosterService' ? service : { supabase: {} });
const person = { id: 'person', personnel_code: 'BS-001', full_name: 'Bác sĩ An', role_type: 'doctor', fixed_cost: 1234567 };
const assignment = { id: 'assignment', schedule_id: 'campaign', personnel_id: person.id, position_label: 'Khám Nội', shift_period: 'FULL', base_cost_snapshot: 1234567, allowance_cost: 7654321 };
function loadComponent(file, stateValues, context, category = 'onsite', onStateChange = () => {}) {
  let index = 0;
  return compile(file, (name) => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return {
      useState(initial) { const current = index++; return [current in stateValues ? stateValues[current] : (initial === 'week' ? 'details' : initial === 'onsite' ? category : typeof initial === 'function' ? initial() : initial), (value) => onStateChange(current, value)]; },
      useMemo: (callback) => callback(), useEffect() {}, useId: () => 'test',
    };
    if (name === './rosterService') return service;
    if (name === './campaignTemplates') return { ...templates, fetchCampaignTemplates: async () => service.CAMPAIGN_POSITION_TEMPLATES };
    if (name === './onsiteCalendar') return compile('onsiteCalendar.ts', () => ({ supabase: {} }));
    if (name === './campaignGroups') return campaignGroups;
    if (name === './campaignPositionOrder') return positionOrder;
    if (name === './useCampaignPositionDrag') return { useCampaignPositionDrag: ({ positions }) => ({ positions, drag: null, drop: null, bodyRef: { current: null }, handleProps: () => ({}) }) };
    if (name === './useRosterData') return { useRosterData: () => context };
    if (name.includes('adminFormatters')) return { formatDisplayDate: (value) => value };
    if (name === '@/lib/utils') return { cn: (...values) => values.filter((value) => typeof value === 'string').join(' ') };
    return new Proxy({}, { get: () => () => null });
  });
}

test('hidden assignment costs never appear in chips, tooltips, personnel choices or editing inputs', () => {
  const props = { rowKey: 'position', targetLabel: 'Khám Nội', assignments: [assignment], activePersonnel: [person], personnelMap: new Map([[person.id, person]]), sameDayAssignmentsByPerson: new Map(), getConflictLocationLabel: () => '', isOpen: true, isMutating: false, onOpenChange() {}, onSaveAssignment() {}, onDeleteAssignment() {} };
  function render(showCosts) {
    const component = loadComponent('RosterAssignmentCell.tsx', { 3: person.id, 5: 1234567, 6: 7654321, 8: true });
    return JSON.stringify(component.RosterAssignmentCell({ ...props, showCosts }));
  }
  const hidden = render(false);
  assert.match(hidden, /Bác sĩ An/);
  assert.doesNotMatch(hidden, /1234567|1\.234\.567|7654321|7\.654\.321|Cost cố định|Phụ cấp \(VNĐ\)/);
  assert.match(render(true), /1\.234\.567|1234567/);
});

test('the campaign screenshot mode removes monetary summaries, allowance controls and cost columns', () => {
  const campaign = { id: 'campaign', schedule_type: 'onsite_exam', branch_code: 'q1', schedule_date: '2026-11-04', campaign_code: 'DOAN-001', company_name: 'DYM', contact_person: '', company_address: '', notes: '', default_allowance: 7654321, provisional_cost: 246810, position_list: ['Khám Nội'] };
  const context = { rosterToday: '2026-11-04', canEditHistory: false, selectedBranch: 'q1', selectedDate: campaign.schedule_date, selectedMonth: '2026-11', schedules: [campaign], assignments: [assignment], activePersonnel: [person], personnelMap: new Map([[person.id, person]]), roomMap: new Map(), dailyRoomOverrides: [], isLoading: false, isMutating: false };
  function render(showCosts) {
    const component = loadComponent('RosterOnsitePage.tsx', { 0: showCosts, 3: campaign.id }, context);
    return JSON.stringify(component.RosterOnsitePage({}));
  }
  const hidden = render(false);
  assert.match(hidden, /Hiện chi phí/);
  assert.doesNotMatch(hidden, /Cost cố định:|Tổng dự kiến:|Dự phòng còn thiếu:|Chi phí vị trí|campaign-default-allowance|camp-allowance-input|1\.234\.567|7\.654\.321|9\.135\.698|246810|246\.810/);
  const visible = render(true);
  assert.match(visible, /Ẩn chi phí/);
  assert.match(visible, /Chi phí vị trí/);
  assert.match(visible, /9\.135\.698/);
  assert.match(visible, /246\.810/);
});

test('a locked reserve is presented as read-only information with no save control', () => {
  const component = loadComponent('RosterProvisionalCost.tsx', {});
  const view = component.RosterProvisionalCost({ branch: 'q1', date: '2026-11-03', amount: 1500000, disabled: false, readOnly: true, historical: true, onSaved() {} });
  assert.equal(view.type, 'div');
  const content = JSON.stringify(view);
  assert.match(content, /1\.500\.000/);
  assert.match(content, /không cộng vào chi phí thực tế/);
  assert.doesNotMatch(content, /Lưu dự phòng|inputMode|onSubmit/);
});

test('daily category tabs separate Blood sampling from Onsite HC/setup and keep date and branch navigation', () => {
  const schedule = { schedule_date: '2026-11-01', branch_code: 'q1', campaign_code: 'CODE', position_list: [], default_allowance: 0 };
  const schedules = [
    { ...schedule, id: 'blood', schedule_type: 'blood_draw', company_name: 'TODAY_BLOOD' },
    { ...schedule, id: 'hc', schedule_type: 'onsite_exam', company_name: 'TODAY_HC' },
    { ...schedule, id: 'setup', schedule_type: 'setup', company_name: 'TODAY_SETUP' },
    { ...schedule, id: 'tomorrow', schedule_date: '2026-11-02', schedule_type: 'blood_draw', company_name: 'OTHER_DATE' },
    { ...schedule, id: 'branch', branch_code: 'q7', schedule_type: 'blood_draw', company_name: 'OTHER_BRANCH' },
  ];
  const dates = [], branches = [];
  const context = { rosterToday: '2026-11-05', canEditHistory: false, selectedBranch: 'q1', selectedDate: schedule.schedule_date, schedules, assignments: [], activePersonnel: [], personnelMap: new Map(), roomMap: new Map(), dailyRoomOverrides: [], isLoading: false, isMutating: false,
    setSelectedDate: (date) => dates.push(date), setSelectedBranch: (branch) => branches.push(branch) };
  const tree = loadComponent('RosterOnsitePage.tsx', {}, context).RosterOnsitePage({});
  const content = JSON.stringify(tree);
  assert.doesNotMatch(content, /TODAY_BLOOD/);
  assert.match(content, /TODAY_HC/);
  assert.match(content, /TODAY_SETUP/);
  assert.doesNotMatch(content, /OTHER_DATE|OTHER_BRANCH|Tháng thực hiện/);
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const nodes = elements(tree);
  const headings = nodes.filter((node) => node.type === 'h3' && node.props.className === 'flex items-center justify-between px-1 text-sm font-semibold');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].props.children[0].props.children, 'Onsite');
  assert.equal(headings[0].props.children[1].props.children[0], 2);
  const blood = loadComponent('RosterOnsitePage.tsx', {}, context, 'blood_draw').RosterOnsitePage({});
  assert.match(JSON.stringify(blood), /TODAY_BLOOD/);
  assert.doesNotMatch(JSON.stringify(blood), /TODAY_HC|TODAY_SETUP|OTHER_DATE|OTHER_BRANCH/);
  assert.ok(nodes.some((node) => node.props?.['aria-label'] === 'Chọn nhóm đoàn'));
  nodes.find((node) => node.props?.['aria-label'] === 'Ngày hôm trước').props.onClick();
  nodes.find((node) => node.props?.['aria-label'] === 'Ngày tiếp theo').props.onClick();
  nodes.find((node) => node.props?.ariaLabel === 'Chọn ngày thực hiện đoàn').props.onChange('2026-12-01');
  nodes.find((node) => node.props?.value === 'q1' && node.props.onValueChange).props.onValueChange('q7');
  assert.deepEqual(dates, ['2026-10-31', '2026-11-02', '2026-12-01']);
  assert.deepEqual(branches, ['q7']);
});

test('creating a campaign saves its edited positions, including additions, without changing the shared template', async () => {
  let saved;
  const form = { schedule_type: 'onsite_exam', branch_code: 'q1', schedule_date: '2026-11-05', campaign_code: 'NEW', company_name: 'DYM', position_list: [' Khám Nội tổng quát ', 'Vị trí riêng'], default_allowance: 0 };
  const context = { rosterToday: '2026-11-05', canEditHistory: false, selectedBranch: 'q1', selectedDate: form.schedule_date, selectedMonth: '2026-11', schedules: [], assignments: [], activePersonnel: [], personnelMap: new Map(), roomMap: new Map(), dailyRoomOverrides: [], isLoading: false, isMutating: false,
    upsertCampaign: async (payload) => { saved = payload; return { ...payload, id: 'new-id' }; }, setSelectedBranch() {}, setSelectedDate() {}, setSelectedMonth() {}, showNotice() {}, setErrorMessage(message) { throw new Error(message); } };
  const component = loadComponent('RosterOnsitePage.tsx', { 4: true, 5: 'create', 7: true, 9: form }, context);
  const tree = component.RosterOnsitePage({});
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  elements(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.deepEqual(saved.position_list, ['Khám Nội tổng quát', 'Vị trí riêng']);
  assert.equal(service.CAMPAIGN_POSITION_TEMPLATES.onsite_exam.includes('Vị trí riêng'), false);
});

test('HC creation can include setup in the same save and keeps setup dates and positions separate', async () => {
  let savedHc, savedSetup, notice;
  const form = { schedule_type: 'onsite_exam', branch_code: 'q1', schedule_date: '2026-11-10', campaign_code: 'DOAN-20261110-001', company_name: 'ABC', position_list: ['Khám Nội'], default_allowance: 100000 };
  const context = { rosterToday: '2026-11-05', canEditHistory: false, selectedBranch: 'q1', selectedDate: form.schedule_date, schedules: [], assignments: [], activePersonnel: [], personnelMap: new Map(), roomMap: new Map(), dailyRoomOverrides: [], isLoading: false, isMutating: false,
    createCampaigns: async (hc, setup) => { savedHc = hc; savedSetup = setup; return [...hc, ...setup].map((item, i) => ({ ...item, id: `${i}` })); },
    upsertCampaign() { throw new Error('Expected a single combined save'); }, setSelectedBranch() {}, setSelectedDate() {}, setSelectedMonth() {}, showNotice(message) { notice = message; } };
  const view = loadComponent('RosterOnsitePage.tsx', { 4: true, 5: 'create', 9: form, 26: ['2026-11-10', '2026-11-11'], 29: true, 30: ['2026-11-09'], 31: ['Chuẩn bị bàn'] }, context).RosterOnsitePage({});
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const nodes = elements(view);
  assert.match(JSON.stringify(view), /Tạo kèm lịch set-up/);
  nodes.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(savedHc.length, 2);
  assert.equal(savedSetup.length, 1);
  assert.equal(savedSetup[0].schedule_date, '2026-11-09');
  assert.equal(savedSetup[0].company_name, 'ABC');
  assert.deepEqual(savedSetup[0].position_list, ['Chuẩn bị bàn']);
  assert.equal(savedSetup[0].default_allowance, 0);
  assert.match(notice, /2 lịch HC và 1 lịch set-up/);
});

test('adding a campaign from a calendar day prefills that exact day, its code and the current branch', async () => {
  const updates = new Map();
  const context = { rosterToday: '2026-11-05', canEditHistory: false, selectedBranch: 'q7', selectedDate: '2026-11-05', schedules: [], assignments: [], activePersonnel: [], personnelMap: new Map(), roomMap: new Map(), dailyRoomOverrides: [], isLoading: false, isMutating: false,
    setErrorMessage(message) { throw new Error(message); } };
  const tree = loadComponent('RosterOnsitePage.tsx', { 22: 'week' }, context, 'onsite', (slot, value) => updates.set(slot, value)).RosterOnsitePage({});
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  elements(tree).find((node) => node.props?.onCreateCampaign).props.onCreateCampaign('2026-11-07');
  await new Promise(setImmediate);
  assert.deepEqual(updates.get(26), ['2026-11-07']);
  assert.equal(updates.get(9).schedule_date, '2026-11-07');
  assert.equal(updates.get(9).branch_code, 'q7');
  assert.match(updates.get(9).campaign_code, /^DOAN-20261107-/);
  assert.equal(updates.get(4), true);
});
