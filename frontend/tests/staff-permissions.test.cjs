const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm: pgTrgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { PERMISSION_MODULES, PERMISSION_ACTIONS, getDefaultPermissions, parsePermissions, hasPermission } = require('./helpers/staff-permissions.cjs');

test('new staff starts without a role or grants and cannot save until a role is chosen', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/accounts/StaffPage.tsx'), 'utf8');
  const ast = ts.createSourceFile('StaffPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const code = ts.transpileModule(`const ${declarations.get('EMPTY_FORM').getText(ast)};
    const ${declarations.get('saveStaff').getText(ast)};
    const ${declarations.get('openEditForm').getText(ast)};
    return { initial: EMPTY_FORM, saveStaff, openEditForm };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let error;
  let edited;
  const form = { displayName: 'Nhân viên', loginName: 'nhanvien', password: '123456', branchCodes: ['q1'], role: '' };
  const handlers = new Function('getDefaultPermissions', 'form', 'setFormError', 'setForm', 'setIsFormOpen', code)(
    getDefaultPermissions, form, (value) => { error = value; }, (value) => { edited = value; }, () => {},
  );
  assert.equal(handlers.initial.role, '');
  assert.deepEqual(handlers.initial.permissions, getDefaultPermissions('none'));
  await handlers.saveStaff({ preventDefault() {} });
  assert.equal(error, 'Vui lòng chọn vai trò cho tài khoản.');
  const account = { userId: 'existing', role: 'operator', permissions: getDefaultPermissions('operator'), branches: [{ code: 'hn' }] };
  handlers.openEditForm(account);
  assert.equal(edited.role, account.role);
  assert.deepEqual(edited.permissions, account.permissions);
});

test('staff management authorizes each action independently of the role and rejects inactive actors', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/manage-staff/index.ts'), 'utf8');
  const ast = ts.createSourceFile('staff.ts', source, ts.ScriptTarget.Latest, true);
  const actor = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'getAdminActor');
  const exports = {};
  const code = ts.transpileModule(`${actor.getText(ast)}\nexports.check = getAdminActor;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'hasPermission', 'console', code)(exports, hasPermission, { error() {} });
  const permissions = getDefaultPermissions('none');
  permissions.staff = { view: true, create: false, update: false, delete: false };
  const profile = { role: 'receptionist', is_active: true, permissions };
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) }, from: () => query };
  assert.equal((await exports.check(client, 'token', 'view')).ok, true);
  for (const action of ['create', 'update', 'delete']) assert.equal((await exports.check(client, 'token', action)).ok, false);
  permissions.staff.update = true;
  assert.equal((await exports.check(client, 'token', 'update')).ok, true);
  profile.is_active = false;
  assert.equal((await exports.check(client, 'token', 'update')).ok, false);
});

test('permissions preserve legacy defaults and accept explicit grants beyond the role', () => {
  assert.equal(hasPermission('receptionist', null, 'clinic'), false);
  assert.equal(hasPermission('admin', null, 'staff', 'delete'), true);
  const permissions = getDefaultPermissions('none');
  assert.ok(Object.values(permissions).every((row) => Object.values(row).every((value) => !value)));
  permissions.clinic = { view: true, create: true, update: false, delete: false };
  assert.equal(hasPermission('receptionist', permissions, 'clinic', 'create'), true);
  assert.equal(hasPermission('admin', permissions, 'staff'), false);
  assert.deepEqual(parsePermissions(permissions), permissions);
  assert.equal(parsePermissions({ ...permissions, clinic: { create: true } }), null);
  assert.equal(parsePermissions({ ...permissions, clinic: { view: 'true' } }), null);
  assert.equal(parsePermissions({ ...permissions, unknown: {} }), null);
});

test('matrix toggles, column selection and presets keep dependent view permissions consistent', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/accounts/StaffPermissionMatrix.tsx'), 'utf8');
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies = { '@/components/ui/button': { Button: 'button' }, '@/components/ui/checkbox': { Checkbox: 'checkbox' }, '@/lib/staffPermissions': require('./helpers/staff-permissions.cjs'), 'react/jsx-runtime': require('react/jsx-runtime') };
  new Function('exports', 'require', code)(exports, (name) => dependencies[name]);
  let value = getDefaultPermissions('none');
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const render = () => nodes(exports.StaffPermissionMatrix({ value, disabled: false, onChange(next) { value = next; } }));
  render().find((node) => node.props?.['aria-label'] === 'Lịch tại Phòng khám: Thêm').props.onCheckedChange(true);
  assert.ok(value.clinic.create && value.clinic.view);
  render().find((node) => node.props?.['aria-label'] === 'Lịch tại Phòng khám: Xem').props.onCheckedChange(false);
  assert.ok(Object.values(value.clinic).every((allowed) => !allowed));
  assert.ok(parsePermissions(value));
  render().find((node) => node.type === 'button' && node.props.children === 'Chỉ xem').props.onClick();
  assert.ok(Object.entries(value).every(([key, row]) => (key === 'printing' ? !row.view : row.view) && PERMISSION_ACTIONS.filter((action) => action !== 'view').every((action) => !row[action])));
  render().find((node) => node.props?.title === 'Chọn hoặc bỏ cả cột Xóa').props.onClick();
  assert.ok(PERMISSION_MODULES.filter((module) => module.actions.includes('delete')).every(({ key }) => value[key].delete && value[key].view));
  assert.ok(parsePermissions(value));
});

test('database matrix enforces grants, denied mutations and branch scope through real migrations', async () => {
  const db = new PGlite({ extensions: { pg_trgm: pgTrgm } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.role',true) $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
      grant usage on schema auth,storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;
      create publication supabase_realtime;
      create function public.rls_auto_enable() returns event_trigger
        language plpgsql security definer as $$ begin null; end; $$;
      create event trigger test_enable_rls on ddl_command_end execute function public.rls_auto_enable();
    `);
    const directory = path.resolve(__dirname, '../../supabase/migrations');
    for (const file of fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
      if (file.includes('bootstrap_initial_admin')) continue;
      const sql = fs.readFileSync(path.join(directory, file), 'utf8')
        .replace(/create extension if not exists pgcrypto;/gi, '');
      try { await db.exec(sql); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    const { rows: indexState } = await db.query(`
      select e.extnamespace::regnamespace::text as schema, i.indisvalid as valid
      from pg_extension e
      join pg_depend d on d.refobjid = e.oid and d.deptype = 'e'
        and d.refclassid = 'pg_extension'::regclass and d.classid = 'pg_opclass'::regclass
      join pg_index i on i.indclass[0] = d.objid
      where e.extname = 'pg_trgm' and i.indexrelid = 'public.registrations_name_search_idx'::regclass
    `);
    assert.deepEqual(indexState, [{ schema: 'extensions', valid: true }]);
    for (const role of ['anon', 'authenticated']) {
      for (const signature of [
        'public.guard_roster_assignment_time_overlap()', 'public.rls_auto_enable()',
        'public.require_permission(text,text)', 'public.can_edit_roster_date(date)',
      ]) {
        const { rows } = await db.query("select has_function_privilege($1::name, $2::text, 'EXECUTE') as allowed", [role, signature]);
        assert.equal(rows[0].allowed, false, `${role} ${signature}`);
      }
    }
    const user = '00000000-0000-4000-8000-000000000001';
    const permissions = getDefaultPermissions('none');
    permissions.clinic = { view: true, create: false, update: false, delete: false };
    await db.query(`insert into auth.users(id) values($1)`, [user]);
    await db.query(`insert into public.profiles(user_id,display_name,role,is_active,permissions) values($1,'Test user','receptionist',true,$2::jsonb)`, [user, JSON.stringify(permissions)]);
    await db.query(`insert into public.staff_branch_access(user_id,branch_id) select $1,id from public.branches where code='q1'`, [user]);
    await db.exec(`select set_config('request.uid','${user}',false); select set_config('request.role','authenticated',false); set role authenticated;`);
    assert.equal((await db.query(`select public.has_permission('clinic') as allowed`)).rows[0].allowed, true);
    assert.equal((await db.query(`select public.has_permission('staff','update') as allowed`)).rows[0].allowed, false);
    await assert.rejects(db.query(`insert into public.clinic_rooms(branch_code,room_name) values('q1','Denied room')`));
    await assert.rejects(db.query(`select * from public.get_dashboard_registrations('q1',current_date)`), /PERMISSION_DENIED/);
    await assert.rejects(db.query(`select * from public.get_reception_trend(2024)`), /PERMISSION_DENIED/);
    await assert.rejects(db.query(`select * from public.get_registration_failures(current_date)`), /PERMISSION_DENIED/);
    await db.exec('reset role');
    await db.exec(`create function public.test_privileged_room_insert() returns void language plpgsql security definer set search_path='' as $$ begin insert into public.clinic_rooms(branch_code,room_name) values('q1','Bypass attempt'); end; $$;`);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.test_privileged_room_insert()'), /PERMISSION_DENIED/);
    permissions.clinic.create = true;
    await db.exec('reset role');
    await db.query(`update public.profiles set permissions=$2::jsonb where user_id=$1`, [user, JSON.stringify(permissions)]);
    await db.exec('set role authenticated');
    await db.query(`insert into public.clinic_rooms(branch_code,room_name) values('q1','Allowed room')`);
    await assert.rejects(db.query(`insert into public.clinic_rooms(branch_code,room_name) values('q7','Other branch')`));
    assert.equal((await db.query(`update public.clinic_rooms set room_name='Denied edit' where room_name='Allowed room' returning id`)).rows.length, 0);
    await db.exec('reset role');
    // Role is a preset: an explicit administrator matrix must also honor branches.
    await db.query(`update public.profiles set role='admin' where user_id=$1`, [user]);
    await db.exec('set role authenticated');
    assert.equal((await db.query(`select public.can_access_branch_code('q7') as allowed`)).rows[0].allowed, false);
    await db.exec('reset role');
    for (const role of ['admin', 'operator', 'receptionist']) {
      await db.query(`update public.profiles set role=$2::public.staff_role, permissions=null where user_id=$1`, [user, role]);
      for (const { key, actions } of PERMISSION_MODULES) for (const action of actions) {
        const actual = (await db.query('select public.has_permission($1,$2) as allowed', [key, action])).rows[0].allowed;
        assert.equal(actual, getDefaultPermissions(role)[key][action], `${role}.${key}.${action}`);
      }
    }
    permissions.overview.view = true;
    await db.query(`update public.profiles set permissions=$2::jsonb where user_id=$1`, [user, JSON.stringify(permissions)]);
    const failureToken = 'e'.repeat(64);
    const failureDay = "(statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date";
    await db.query(`insert into public.registration_access_sessions(token_hash, branch_id, expires_at)
      select $1, id, now() + interval '20 minutes' from public.branches where code='q1'`, [failureToken]);
    await db.exec('set role service_role');
    await db.query("select public.record_registration_failure('q1','invalid_data',$1)", [failureToken]);
    await db.query("select public.record_registration_failure('q1','invalid_data',$1)", [failureToken]);
    await db.query("select public.record_registration_failure('q7','invalid_data',$1)", [failureToken]);
    await db.query("select public.record_registration_failure('q1','server_error',$1)", ['f'.repeat(64)]);
    await db.query("select public.record_registration_failure('q7','qr_expired',null)");
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query("select public.record_registration_failure('q1','qr_expired',null)"), /permission denied/);
    await assert.rejects(db.query("select * from public.registration_failure_counts"), /permission denied/);
    await assert.rejects(db.query(`select * from public.get_registration_failures(${failureDay}, 'q7')`), /ACCESS_DENIED/);
    const failures = (await db.query(`select * from public.get_registration_failures(${failureDay})`)).rows;
    assert.deepEqual(failures.map(row => [row.kind, Number(row.total)]), [['invalid_data', 2]]);
    assert.deepEqual((await db.query(`select * from public.get_registration_failures(${failureDay} - 1)`)).rows, []);
    await db.exec('reset role');
    await db.exec(`insert into public.registrations(branch_id,queue_date,queue_number,full_name,birth_date,gender,phone_number,identity_document,province,ward,address_detail,state,completed_at,cancelled_at)
      select b.id,v.day::date,v.ticket,'Test patient','1990-01-01','Nam','0901234567','001090000001','Test','Test','Test address',v.state::public.registration_state,
        case when v.state='completed' then now() end,case when v.state='cancelled' then now() end
      from (values ('q1','2024-02-29',1,'active'),('q1','2024-02-29',2,'completed'),('q1','2024-02-29',3,'cancelled'),('q7','2024-02-29',1,'active'),('q1','2024-03-01',1,'active'),('q1','2023-02-28',1,'active')) v(branch,day,ticket,state)
      join public.branches b on b.code=v.branch;`);
    const { rows: targetRows } = await db.query(`
      select b.code, r.id from public.registrations r join public.branches b on b.id=r.branch_id
      where r.queue_date='2024-02-29' and r.queue_number=1
    `);
    const edit = (branch) => db.query(`select public.update_registration_details(
      $1, 'Updated patient', '1990-01-01', 'Nam', '0901234567', '001090000001', '', 'Test', 'Test', 'Test address'
    )`, [targetRows.find(row => row.code === branch).id]);
    const historyDraft = { familyHistory: { hasDisease: true, diseaseDetails: 'Ghi chú thử' },
      personalHistory: { 7: true }, personalOtherDetails: '', currentTreatment: { isTreating: null, medications: '' } };
    const editHistory = (branch, draft = historyDraft, expected = null) => db.query(`select public.update_registration_medical_history($1, $2, $3) as history`,
      [targetRows.find(row => row.code === branch).id, draft, expected]);
    await db.exec('set role authenticated');
    await assert.rejects(edit('q1'), /PERMISSION_DENIED/);
    await assert.rejects(editHistory('q1'), /PERMISSION_DENIED/);
    await db.exec('reset role');
    permissions.registrations.view = true;
    permissions.registrations.update = true;
    await db.query(`update public.profiles set permissions=$2::jsonb where user_id=$1`, [user, JSON.stringify(permissions)]);
    await db.exec('set role authenticated');
    await edit('q1');
    await assert.rejects(edit('q7'), /ACCESS_DENIED/);
    await assert.rejects(editHistory('q7'), /ACCESS_DENIED/);
    await assert.rejects(editHistory('q1', { ...historyDraft, commitmentAgreed: true }), /INVALID_MEDICAL_HISTORY/);
    const { rows: [{ history: savedHistory }] } = await editHistory('q1');
    assert.deepEqual(savedHistory, { ...historyDraft, commitmentAgreed: false });
    await editHistory('q1');
    await assert.rejects(editHistory('q1', { ...historyDraft, personalHistory: { 7: false } }), /MEDICAL_HISTORY_CHANGED/);
    await db.exec('reset role');
    const { rows: [recorded] } = await db.query(`select r.tt25_data, a.actor_id from public.registrations r
      join public.audit_logs a on a.entity_id=r.id and a.action='registration.medical_history_updated' where r.id=$1`,
      [targetRows.find(row => row.code === 'q1').id]);
    assert.equal(recorded.actor_id, user);
    assert.deepEqual(recorded.tt25_data.medicalHistory, savedHistory);
    await db.exec('set role authenticated');
    let trend = (await db.query(`select * from public.get_reception_trend(2024)`)).rows;
    assert.deepEqual(trend.map((row) => [row.queue_date.toISOString().slice(0, 10), Number(row.total)]), [['2024-02-29', 2], ['2024-03-01', 1]]);
    assert.deepEqual(Object.keys(trend[0]), ['queue_date', 'total']);
    await assert.rejects(db.query(`select * from public.get_reception_trend(2024,'q7')`), /ACCESS_DENIED/);
    await assert.rejects(db.query(`select * from public.get_reception_trend(null)`), /INVALID_YEAR/);
    await db.exec('reset role');
    await db.query(`insert into public.staff_branch_access(user_id,branch_id) select $1,id from public.branches where code='q7'`, [user]);
    await db.exec('set role authenticated');
    trend = (await db.query(`select * from public.get_reception_trend(2024)`)).rows;
    assert.equal(Number(trend[0].total), 3);
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(db.query(`select * from public.get_reception_trend(2024)`), /permission denied/);
    await assert.rejects(db.query(`select * from public.get_registration_failures(current_date)`), /permission denied/);
    await assert.rejects(db.query('select * from public.roster_unavailability'), /permission denied/);
    await db.exec('reset role');
    await db.exec("select set_config('request.role','service_role',false)");
    const { rows: [person] } = await db.query("insert into public.medical_personnel(personnel_code,full_name,role_type) values('TEST-UB','Test availability','doctor') returning id");
    const { rows: [schedule] } = await db.query("insert into public.roster_schedules(branch_code,schedule_date,schedule_type,campaign_code,company_name) values('q7',current_date + 10,'onsite_exam','TEST-UB','Test company') returning id");
    const declareBusy = (start, end) => db.query(`insert into public.roster_unavailability(personnel_id,unavailable_date,start_minute,end_minute)
      values($1,current_date + 10,$2,$3)`, [person.id, start, end]);
    await declareBusy(780, 900);
    const assign = (shift) => db.query(`insert into public.roster_assignments(schedule_id,personnel_id,position_label,shift_period)
      values($1,$2,'Test position',$3)`, [schedule.id, person.id, shift]);
    await assert.rejects(assign('PM'), { code: '23P01' });
    await assign('AM');
    await assert.rejects(declareBusy(0, 1440), { code: '23P01' });
    await assert.rejects(declareBusy(781, 900), { code: '23514' });
    await db.exec("select set_config('request.role','authenticated',false); set role authenticated;");
    assert.equal((await db.query('select * from public.roster_unavailability')).rows.length, 1);
    await assert.rejects(declareBusy(900, 915), /row-level security/);
    await db.exec('reset role');

    await db.exec("select set_config('request.role','service_role',false)");
    const { rows: [original, replacement, legacyOriginal] } = await db.query(`insert into public.medical_personnel(personnel_code,full_name,role_type,fixed_cost)
      values('TEST-OLD','Original nurse','nurse',1200000),('TEST-NEW','Replacement nurse','nurse',1800000),
      ('TEST-LEGACY','Onsite nurse','nurse',1300000) returning id`);
    const { rows: [clinic] } = await db.query(`insert into public.roster_schedules(branch_code,schedule_date,schedule_type)
      values('q1',current_date + 10,'insite') returning id`);
    const { rows: [shift] } = await db.query(`insert into public.roster_assignments(schedule_id,personnel_id,position_label,shift_period,
      start_minute,end_minute,day_rate_snapshot,base_cost_snapshot,allowance_cost)
      values($1,$2,'Phòng khám','FULL',420,660,1200000,600000,50000) returning id`, [clinic.id, original.id]);
    const { rows: [legacy] } = await db.query(`insert into public.roster_assignments(schedule_id,personnel_id,position_label,shift_period)
      values($1,$2,'Lễ tân','AM') returning id`, [schedule.id, legacyOriginal.id]);
    permissions.clinic.update = true;
    permissions.onsite.view = true;
    permissions.onsite.update = true;
    await db.query('update public.profiles set permissions=$2::jsonb where user_id=$1', [user, JSON.stringify(permissions)]);
    await db.exec("select set_config('request.role','authenticated',false); set role authenticated;");
    const replace = (assignment, target) => db.query(`update public.roster_assignments
      set personnel_id=$2 where id=$1 returning base_cost_snapshot, total_cost`, [assignment, target]);
    const getChanges = (assignment) => db.query('select * from public.get_roster_assignment_changes($1)', [assignment]);
    await assert.rejects(replace(shift.id, person.id), { code: '23P01' });
    await assert.rejects(replace(legacy.id, person.id), { code: '23P01' });
    assert.deepEqual((await getChanges(shift.id)).rows, []);
    const { rows: [changed] } = await replace(shift.id, replacement.id);
    assert.equal(Number(changed.base_cost_snapshot), 900000);
    assert.equal(Number(changed.total_cost), 950000);
    const { rows: [history] } = await getChanges(shift.id);
    assert.equal(history.actor_name, 'Test user');
    assert.equal(history.from_name, 'Original nurse');
    assert.equal(history.to_name, 'Replacement nurse');
    await replace(shift.id, replacement.id);
    assert.equal((await getChanges(shift.id)).rows.length, 1);
    await db.exec('reset role');
    await db.query(`delete from public.staff_branch_access where user_id=$1 and branch_id in (select id from public.branches where code='q1')`, [user]);
    await db.exec('set role authenticated');
    assert.deepEqual((await getChanges(shift.id)).rows, []);
    await db.exec('reset role');

    await db.query(`update public.profiles set is_active=false where user_id=$1`, [user]);
    assert.equal((await db.query(`select public.has_permission('clinic') as allowed`)).rows[0].allowed, false);
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`select * from public.get_reception_trend(2024)`), /PERMISSION_DENIED/);
  } finally { await db.close(); }
});
