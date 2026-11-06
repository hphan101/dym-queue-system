const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'frontend/src/features/admin/roster');
function load(file, imports = {}) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(result, (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  });
  return result;
}
const specialties = load('doctorSpecialties.ts');
const campaignGroups = load('campaignGroups.ts');
const positionOrder = load('campaignPositionOrder.ts');
const service = (supabase = {}) => load('rosterService.ts', { '../../../lib/supabaseClient': { supabase }, './doctorSpecialties': specialties });

test('shared number formatting preserves rounding, invalid values and empty nonpositive inputs', () => {
  const api = service();
  const formatter = new Intl.NumberFormat('vi-VN');
  for (const amount of [0, -0, -0.2, -1.5, 0.4, 0.5, 1234567.8, NaN, Infinity, -Infinity]) {
    const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
    assert.equal(api.formatNumberPlain(amount), formatter.format(safeAmount));
    assert.equal(api.formatVndCurrency(amount), formatter.format(safeAmount) + ' ₫');
    assert.equal(api.formatCurrencyInput(amount), safeAmount <= 0 ? '' : formatter.format(safeAmount));
  }
});

test('clinic dragging saves only the selected daily schedule and propagates history-lock errors', async () => {
  const filters = [];
  let payload;
  let fail = false;
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { data: { id: 'clinic-day', schedule_type: 'insite', position_list: [] } }; },
    update(value) { payload = value; return this; },
    async single() { return fail ? { error: { message: 'History locked' } } : { data: { id: 'clinic-day', ...payload } }; },
  };
  const api = service({ from: () => query });
  await api.saveClinicRoomOrder('q7', '2026-11-04', ['override:2', 'room:1']);
  assert.deepEqual(filters, [['schedule_type', 'insite'], ['branch_code', 'q7'], ['schedule_date', '2026-11-04'], ['id', 'clinic-day']]);
  assert.deepEqual(payload.position_list, ['override:2', 'room:1']);
  assert.equal(payload.position_order_mode, 'manual');
  fail = true;
  await assert.rejects(api.saveClinicRoomOrder('q7', '2026-11-04', ['room:1']), /History locked/);
});

test('positions default to natural alphabetical order and dragging preserves every position', () => {
  const input = ['Z', 'A10', 'A2', 'A2', ' M ', ''];
  assert.deepEqual(positionOrder.orderCampaignPositions(input), ['A2', 'A10', 'M', 'Z']);
  assert.deepEqual(positionOrder.orderCampaignPositions(input, 'manual'), ['Z', 'A10', 'A2', 'M']);
  const positions = ['A', 'B', 'C'];
  assert.deepEqual(positionOrder.moveCampaignPosition(positions, 'C', 'A'), ['C', 'A', 'B']);
  assert.deepEqual(positionOrder.moveCampaignPosition(positions, 'A', 'C'), ['B', 'C', 'A']);
  assert.deepEqual(positionOrder.moveCampaignPosition(positions, 'missing', 'C'), positions);
  assert.deepEqual(positions, ['A', 'B', 'C']);
});

test('saving a position order persists its mode; ordinary list updates do not reset it', async () => {
  let payload;
  let fail = false;
  const query = { update(value) { payload = value; return this; }, eq() { return this; }, select() { return this; }, async single() { return fail ? { error: { message: 'Offline' } } : { data: { ...payload } }; } };
  const api = service({ from: () => query });
  await api.updateCampaignPositionList('campaign', ['B', 'A'], 'manual');
  assert.deepEqual(payload.position_list, ['B', 'A']);
  assert.equal(payload.position_order_mode, 'manual');
  await api.updateCampaignPositionList('campaign', ['B', 'A', 'C']);
  assert.equal('position_order_mode' in payload, false);
  fail = true;
  await assert.rejects(api.updateCampaignPositionList('campaign', ['A', 'B'], 'alphabetical'), /Offline/);
  const db = new PGlite();
  try {
    await db.exec('create table public.roster_schedules(id int); insert into public.roster_schedules values(1)');
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261104120000_add_campaign_position_order.sql'), 'utf8'));
    assert.equal((await db.query('select position_order_mode from public.roster_schedules')).rows[0].position_order_mode, 'alphabetical');
    await assert.rejects(db.exec("update public.roster_schedules set position_order_mode='invalid'"), /check constraint/);
  } finally { await db.close(); }
});

test('daily campaign statistics count registrations by type and retain the exact detail list', () => {
  const items = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `blood-${i}`, schedule_type: 'blood_draw', schedule_date: '2026-11-01' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `onsite-${i}`, schedule_type: 'onsite_exam', schedule_date: '2026-11-01' })),
    { id: 'setup', schedule_type: 'setup', schedule_date: '2026-11-01' },
    { id: 'later', schedule_type: 'blood_draw', schedule_date: '2026-11-03' },
    { id: 'insite', schedule_type: 'insite', schedule_date: '2026-11-01' },
  ];
  const days = campaignGroups.groupCampaignsByDate([...items].reverse());
  assert.deepEqual(days.map((day) => day.date), ['2026-11-01', '2026-11-03']);
  assert.equal(days[0].total, 8);
  assert.deepEqual(days[0].groups.map((group) => group.items.length), [5, 2, 1]);
  assert.deepEqual(days[0].groups[2].items.map((item) => item.id), ['setup']);
  assert.equal(days[1].groups[1].items.length, 0);
  assert.deepEqual(campaignGroups.groupCampaignsByDate([]), []);
});

test('Setup is supported by template selection, create, clone and the database type constraint', async () => {
  const writes = [];
  const query = { insert(value) { writes.push(value); return this; }, select() { return this; }, async single() { return { data: { id: 'setup', ...writes.at(-1) } }; } };
  const api = service({ from: () => query });
  assert.deepEqual(api.CAMPAIGN_POSITION_TEMPLATES.setup, []);
  assert.equal(api.SCHEDULE_TYPE_LABELS.setup, 'Onsite set-up');
  const input = { schedule_type: 'setup', branch_code: 'q1', schedule_date: '2026-11-01', campaign_code: 'SETUP-01', company_name: 'DYM', contact_person: '', company_address: '', notes: '', position_list: [] };
  await api.saveOnsiteSchedule(input);
  await api.duplicateOnsiteCampaign(input, [], false);
  assert.equal(writes.every((row) => row.schedule_type === 'setup'), true);
  const db = new PGlite();
  try {
    await db.exec("create table public.roster_schedules(schedule_type text check (schedule_type in ('insite','onsite_exam','blood_draw')))");
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261104110000_add_setup_campaign_type.sql'), 'utf8'));
    await db.exec("insert into public.roster_schedules values('setup'),('blood_draw'),('onsite_exam'),('insite')");
    await assert.rejects(db.exec("insert into public.roster_schedules values('invalid')"), /check constraint/);
  } finally { await db.close(); }
});

test('doctors can have multiple specialties; internal doctors appear only in internal/report rooms', () => {
  const internal = { role_type: 'doctor', specialties: ['internal'] };
  for (const room of ['IMD 1 (C10)', 'IMD2', 'Nội', 'REPORT']) {
    assert.equal(specialties.inferDoctorSpecialty(room), 'internal');
    assert.equal(specialties.canAssignDoctorToRoom(internal, specialties.inferDoctorSpecialty(room)), true);
  }
  for (const room of ['SA1', 'U/S1', 'Siêu âm', 'EYE1', 'ENT 1', 'DENTAL1', 'GYN1', 'Xray 1']) {
    assert.equal(specialties.canAssignDoctorToRoom(internal, specialties.inferDoctorSpecialty(room)), false);
  }
  assert.equal(specialties.canAssignDoctorToRoom({ role_type: 'doctor', specialties: ['internal', 'ultrasound'] }, 'ultrasound'), true);
  assert.equal(specialties.canAssignDoctorToRoom({ role_type: 'doctor' }, 'internal'), false);
  assert.equal(specialties.canAssignDoctorToRoom(internal, null), false);
  assert.equal(specialties.canAssignDoctorToRoom({ role_type: 'nurse' }, 'internal'), true);
  assert.deepEqual(service().validateDoctorSpecialties(['internal', 'internal', 'ultrasound']), ['internal', 'ultrasound']);
  assert.throws(() => service().validateDoctorSpecialties(['anything']), /không hợp lệ/);
});

test('provisional costs save without assigned personnel and add to, rather than replace, assigned cost', async () => {
  let payload;
  const existing = { id: 'schedule', schedule_type: 'insite', branch_code: 'q1', schedule_date: '2026-11-17', position_list: [], provisional_cost: 0 };
  const query = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: existing }; },
    update(value) { payload = value; return this; },
    async single() { return { data: { ...existing, ...payload } }; },
  };
  const api = service({ from(table) { assert.equal(table, 'roster_schedules'); return query; } });
  const saved = await api.saveInsiteProvisionalCost('q1', '2026-11-17', 1500000);
  assert.deepEqual(payload, { provisional_cost: 1500000 });
  assert.equal(api.getProvisionalCost(saved), 1500000);
  assert.equal(api.summarizeAssignmentCosts([{ base_cost_snapshot: 1000000, allowance_cost: 200000 }]).totalCost + api.getProvisionalCost(saved), 2700000);
  for (const type of ['insite', 'onsite_exam', 'blood_draw', 'setup']) {
    assert.equal(api.getProvisionalCost({ schedule_type: type, provisional_cost: 999 }), 999);
  }
  await api.saveInsiteProvisionalCost('q1', '2026-11-17', 0);
  assert.equal(payload.provisional_cost, 0);
  for (const amount of [-1, NaN, Infinity, 1.5, 1000000000001]) await assert.rejects(api.saveInsiteProvisionalCost('q1', '2026-11-17', amount), /dự phòng/);
});

test('campaign reserves save by schedule ID without assigning personnel and can be reduced to zero', async () => {
  const writes = [];
  let failure = false;
  const query = {
    update(value) { writes.push(value); return this; },
    eq(column, id) { assert.equal(column, 'id'); assert.equal(id, 'onsite-campaign'); return this; },
    select() { return this; },
    async single() { return failure ? { error: new Error('Offline') } : { data: { id: 'onsite-campaign', schedule_type: 'onsite_exam', ...writes.at(-1) } }; },
  };
  const api = service({ from(table) { assert.equal(table, 'roster_schedules'); return query; } });
  const saved = await api.saveScheduleProvisionalCost('onsite-campaign', 2000000);
  assert.equal(api.getProvisionalCost(saved), 2000000);
  assert.deepEqual(writes[0], { provisional_cost: 2000000 });
  await api.saveScheduleProvisionalCost('onsite-campaign', 0);
  assert.deepEqual(writes.at(-1), { provisional_cost: 0 });
  failure = true;
  await assert.rejects(api.saveScheduleProvisionalCost('onsite-campaign', 500000), /Không thể lưu/);
  const count = writes.length;
  for (const amount of [-1, NaN, 1.5, 1000000000001]) await assert.rejects(api.saveScheduleProvisionalCost('onsite-campaign', amount), /dự phòng/);
  assert.equal(writes.length, count);
});

test('database defaults preserve existing records and reject unknown specialties and invalid provisional amounts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.medical_personnel(id int); insert into public.medical_personnel values(1);
      create table public.clinic_rooms(id int,room_name text); insert into public.clinic_rooms values(1,'REPORT'),(2,'SA1');
      create table public.roster_schedules(id int); insert into public.roster_schedules values(1);`);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261104090000_add_doctor_specialties_and_provisional_cost.sql'), 'utf8'));
    assert.deepEqual((await db.query('select specialties from public.medical_personnel')).rows[0].specialties, []);
    assert.deepEqual((await db.query('select doctor_specialty from public.clinic_rooms order by id')).rows.map((row) => row.doctor_specialty), ['internal', 'ultrasound']);
    assert.equal(Number((await db.query('select provisional_cost from public.roster_schedules')).rows[0].provisional_cost), 0);
    await assert.rejects(db.exec("update public.medical_personnel set specialties=array['invalid']"), /check constraint/);
    await assert.rejects(db.exec('update public.roster_schedules set provisional_cost=-1'), /check constraint/);
    await db.exec("update public.medical_personnel set specialties=array['internal','ultrasound']; update public.roster_schedules set provisional_cost=1500000;");
  } finally { await db.close(); }
});

test('daily Excel includes a separate provisional row and monthly provisional sheets never assign it to a person', () => {
  const source = fs.readFileSync(path.join(directory, 'exportRosterExcel.ts'), 'utf8');
  const ast = ts.createSourceFile('excel.ts', source, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && ['renderRowXml', 'exportScheduleCostExcel', 'buildProvisionalSheet', 'buildActualCostSheet'].includes(node.name?.text));
  const xlsx = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'frontend/src/lib/xlsx.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', code)(xlsx);
  const deps = { ...service(), ...positionOrder, ...xlsx, getTodayInVietnam: () => '2026-11-17', formatDisplayDate: (value) => value };
  let sheet;
  const exported = {};
  const selected = functions.map((node) => node.getText(ast)).join('\n') + '\nexports.reserveSheet = buildProvisionalSheet; exports.actualSheet = buildActualCostSheet;';
  new Function('exports', 'triggerXlsxDownload', ...Object.keys(deps), ts.transpileModule(selected, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exported, (sheets) => { sheet = sheets[0].xml; }, ...Object.values(deps));
  const schedule = { schedule_type: 'insite', branch_code: 'q1', schedule_date: '2026-11-17', provisional_cost: 1500000 };
  exported.exportScheduleCostExcel({ schedule, assignments: [], personnelMap: new Map(), roomMap: new Map() });
  assert.match(sheet, /DỰ PHÒNG CÒN THIẾU/);
  assert.match(sheet, /<v>1500000<\/v>/);
  const monthly = exported.reserveSheet('2026-11', [schedule, { ...schedule, schedule_date: '2026-12-01' }]);
  assert.match(monthly, /TỔNG DỰ PHÒNG/);
  assert.doesNotMatch(monthly, /2026-12-01/);
  const actual = exported.actualSheet('2026-11', [{ ...schedule, id: 'past', schedule_date: '2026-11-16' }, { ...schedule, id: 'future', schedule_date: '2026-11-18' }], [
    { schedule_id: 'past', base_cost_snapshot: 1000000, allowance_cost: 200000 },
    { schedule_id: 'future', base_cost_snapshot: 9000000, allowance_cost: 0 },
  ]);
  assert.match(actual, /<v>1200000<\/v>/);
  assert.doesNotMatch(actual, /<v>1500000<\/v>|<v>9000000<\/v>/);
  exported.exportScheduleCostExcel({ schedule: { ...schedule, schedule_type: 'onsite_exam', sales_person: 'Sales Nguyễn An', departure_address: 'DYM Quận 7' }, assignments: [], personnelMap: new Map(), roomMap: new Map() });
  assert.match(sheet, /Sales phụ trách: Sales Nguyễn An/);
  assert.match(sheet, /Địa chỉ xuất phát: DYM Quận 7/);
  assert.match(sheet, /Cơ sở ký hợp đồng:/);
  exported.exportScheduleCostExcel({ schedule: { ...schedule, schedule_date: '2026-11-16' }, assignments: [], personnelMap: new Map(), roomMap: new Map() });
  assert.doesNotMatch(sheet, /DỰ PHÒNG CÒN THIẾU/);
  assert.doesNotMatch(sheet, /<v>1500000<\/v>/);
  const orderedSchedule = { ...schedule, schedule_type: 'onsite_exam', position_list: ['Z-Vị trí', 'A-Vị trí'], position_order_mode: 'manual' };
  const assigned = ['A-Vị trí', 'Z-Vị trí'].map((position_label, id) => ({ id, position_label, personnel_id: 'person', shift_period: 'FULL', base_cost_snapshot: 100, allowance_cost: 0 }));
  const personnel = new Map([['person', { full_name: 'Nguyễn A', personnel_code: 'BS-001', role_type: 'doctor' }]]);
  exported.exportScheduleCostExcel({ schedule: orderedSchedule, assignments: assigned, personnelMap: personnel, roomMap: new Map() });
  assert.ok(sheet.indexOf('Z-Vị trí') < sheet.indexOf('A-Vị trí'));
  exported.exportScheduleCostExcel({ schedule: { ...orderedSchedule, position_order_mode: 'alphabetical' }, assignments: assigned, personnelMap: personnel, roomMap: new Map() });
  assert.ok(sheet.indexOf('A-Vị trí') < sheet.indexOf('Z-Vị trí'));
});

test('campaign creation, editing and cloning retain sales and departure fields without erasing omitted fields', async () => {
  const writes = [];
  const query = {
    insert(value) { writes.push(value); return this; },
    update(value) { writes.push(value); return this; },
    eq() { return this; }, select() { return this; },
    async single() { return { data: { id: 'campaign', ...writes.at(-1) } }; },
  };
  const api = service({ from: () => query });
  const input = { schedule_type: 'onsite_exam', branch_code: 'q7', schedule_date: '2026-11-04', campaign_code: 'DOAN-001', company_name: 'Công ty A', contact_person: 'Người phụ trách', company_address: 'Địa chỉ khám', notes: '', sales_person: ' Sales A ', departure_address: ' Phòng khám D7 ' };
  await api.saveOnsiteSchedule(input);
  await api.saveOnsiteSchedule({ ...input, id: 'existing' });
  await api.duplicateOnsiteCampaign(input, [], false);
  for (const payload of writes) {
    assert.equal(payload.sales_person, 'Sales A');
    assert.equal(payload.departure_address, 'Phòng khám D7');
    assert.equal(payload.branch_code, 'q7');
    assert.equal(payload.contact_person, 'Người phụ trách');
    assert.equal(payload.company_address, 'Địa chỉ khám');
  }
  await api.saveOnsiteSchedule({ ...input, sales_person: undefined, departure_address: undefined });
  assert.equal('sales_person' in writes.at(-1), false);
  assert.equal('departure_address' in writes.at(-1), false);
  await assert.rejects(api.saveOnsiteSchedule({ ...input, sales_person: 'x'.repeat(256) }), /255/);
});
