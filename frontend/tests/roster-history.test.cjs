const { rosterPath, rosterImport } = require('./helpers/roster-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'frontend/src/features/admin/roster');
function compile(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; }
function loadService() {
  const result = {};
  new Function('exports', 'require', compile(fs.readFileSync(rosterPath('rosterService.ts'), 'utf8')))(result, () => ({}));
  return result;
}

test('yesterday is locked even for admins without an explicit grant; historical reserves never count as actual costs', () => {
  const api = loadService();
  assert.equal(api.isRosterDateLocked('2026-11-03', '2026-11-04', false), true);
  assert.equal(api.isRosterDateLocked('2026-11-04', '2026-11-04', false), false);
  assert.equal(api.isRosterDateLocked('2026-11-03', '2026-11-04', true), false);
  for (const type of ['insite', 'onsite_exam', 'blood_draw', 'setup']) {
    const schedule = { schedule_type: type, provisional_cost: 1500000, schedule_date: '2026-11-03' };
    assert.equal(api.getCountedProvisionalCost(schedule, '2026-11-04'), 0);
    assert.equal(api.getCountedProvisionalCost(schedule, '2026-11-03'), 1500000);
    assert.equal(api.getProvisionalCost(schedule), 1500000);
  }
});

test('staff permission parsing validates the flag and allows history editing independently from the role preset', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/manage-staff/index.ts'), 'utf8');
  const ast = ts.createSourceFile('staff.ts', source, ts.ScriptTarget.Latest, true);
  const parser = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'parseStaffInput');
  const result = {};
  new Function('exports', 'ALLOWED_ROLES', 'ALLOWED_BRANCH_CODES', 'isSafeText', 'getDefaultPermissions', 'parsePermissions', compile(`${parser.getText(ast)}\nexports.parse = parseStaffInput;`))(
    result, new Set(['admin', 'operator', 'receptionist']), new Set(['q1', 'q7', 'hn']), (value, min, max) => value.length >= min && value.length <= max,
    require('./helpers/staff-permissions.cjs').getDefaultPermissions, require('./helpers/staff-permissions.cjs').parsePermissions,
  );
  const input = { displayName: 'Test staff', role: 'operator', branchCodes: ['q1'] };
  assert.equal(result.parse(input).canEditRosterHistory, false);
  assert.equal(result.parse({ ...input, canEditRosterHistory: true }).canEditRosterHistory, true);
  assert.equal(result.parse({ ...input, role: 'receptionist', canEditRosterHistory: true }).canEditRosterHistory, true);
  assert.equal(result.parse({ ...input, canEditRosterHistory: 'true' }), null);
});

test('database blocks historical writes, date bypasses and cascading edits while preserving branch scope', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const operator = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`
      create role authenticated; create role service_role;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.role',true) $$;
      create table public.profiles(user_id uuid primary key, role text, is_active boolean, branch text);
      insert into public.profiles values('${admin}','admin',true,'q1'),('${operator}','operator',true,'q1');
      create table public.clinic_rooms(id uuid primary key, room_name text, branch_code text, display_order int default 0, is_active boolean default true, inactive_from date);
      create table public.roster_schedules(id uuid primary key default gen_random_uuid(), schedule_date date, branch_code text, provisional_cost bigint default 0);
      create table public.roster_assignments(id uuid primary key default gen_random_uuid(), schedule_id uuid references public.roster_schedules(id) on delete cascade, room_id uuid references public.clinic_rooms(id) on delete set null, note text default '');
      create table public.roster_daily_room_overrides(id uuid primary key default gen_random_uuid(), schedule_date date, branch_code text, room_id uuid);
      insert into public.clinic_rooms(id,room_name,branch_code) values('${admin}','Nội','q1');
      insert into public.roster_schedules(id,schedule_date,branch_code) values('${admin}',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-1,'q1'),('${operator}',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,'q1');
      insert into public.roster_assignments(schedule_id,room_id) values('${admin}','${admin}');
      insert into public.roster_daily_room_overrides(schedule_date,branch_code) values((clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-1,'q1');
      grant select on public.profiles to authenticated;
      grant select,insert,update,delete on public.roster_schedules, public.roster_assignments, public.roster_daily_room_overrides, public.clinic_rooms to authenticated;
      alter table public.roster_schedules enable row level security;
      create policy scope on public.roster_schedules for all to authenticated using(branch_code=(select branch from public.profiles where user_id=auth.uid())) with check(branch_code=(select branch from public.profiles where user_id=auth.uid()));
    `);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261104130000_lock_roster_history.sql'), 'utf8'));
    const today = (await db.query("select ((clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date)::text as day")).rows[0].day;
    await db.exec(`set role authenticated; set request.role='authenticated'; set request.uid='${admin}'`);
    await assert.rejects(db.query('update public.roster_schedules set provisional_cost=1 where id=$1', [admin]), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.query('update public.roster_schedules set schedule_date=$1 where id=$2', [today, admin]), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.query('update public.roster_schedules set schedule_date=$1::date-1 where id=$2', [today, operator]), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.query('update public.roster_assignments set schedule_id=$1 where schedule_id=$2', [operator, admin]), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.exec("update public.roster_assignments set note='changed'"), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.exec('delete from public.roster_daily_room_overrides'), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.exec("update public.clinic_rooms set room_name='changed'"), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(db.exec('update public.profiles set can_edit_roster_history=true'), /permission denied/);
    await db.query('update public.roster_schedules set provisional_cost=100 where id=$1', [operator]);
    await db.query('insert into public.roster_assignments(schedule_id) values($1)', [operator]);
    await db.query('delete from public.roster_schedules where id=$1', [operator]);
    await db.exec('reset role');
    await db.query('update public.profiles set can_edit_roster_history=true where user_id=$1', [operator]);
    await db.query('insert into public.roster_schedules(schedule_date,branch_code) values($1,$2)', [today, 'q7']);
    await db.exec(`set role authenticated; set request.uid='${operator}'`);
    await db.query('update public.roster_schedules set provisional_cost=500 where id=$1', [admin]);
    await db.exec("update public.roster_assignments set note='allowed'");
    assert.equal((await db.query("update public.roster_schedules set provisional_cost=999 where branch_code='q7' returning id")).rows.length, 0);
    await db.exec('reset role');
    await db.query('update public.profiles set is_active=false where user_id=$1', [operator]);
    await db.exec(`set role authenticated; set request.uid='${operator}'`);
    await assert.rejects(db.query('update public.roster_schedules set provisional_cost=600 where id=$1', [admin]), /ROSTER_HISTORY_LOCKED/);
  } finally { await db.close(); }
});
