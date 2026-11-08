const { rosterPath, rosterImport } = require('./helpers/roster-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'frontend/src/features/admin/roster');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(rosterPath(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, (name) => imports[rosterImport(name)] ?? {});
  return exports;
}

test('HC grouping uses explicit batch identity, never the company name, and setup captions identify dates and codes', () => {
  const api = load('setupLinks.ts');
  const a = { id: 'a', campaign_group_id: 'group', schedule_type: 'onsite_exam', company_name: 'ABC', campaign_code: 'HC-A', schedule_date: '2026-11-10' };
  const b = { ...a, id: 'b', campaign_code: 'HC-B', schedule_date: '2026-11-11' };
  const other = { ...a, id: 'other', campaign_group_id: 'other' };
  const groups = api.groupHcSchedules([b, a, other, { ...a, id: 'legacy', campaign_group_id: undefined }, { ...a, schedule_type: 'setup' }]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].items.map((item) => item.id), ['a', 'b']);
  assert.match(api.setupCaption({ setup_targets: [a, b] }), /Thuộc đoàn khám ABC.*10\/11\/2026, 11\/11\/2026/);
  assert.equal(api.setupCaption({}), 'Chưa liên kết đoàn HC');
});

test('setup picker selects an HC event, lets users choose its dates and never shows choices from a stale branch', () => {
  const a = { id: 'a', campaign_group_id: 'group', schedule_type: 'onsite_exam', company_name: 'ABC', campaign_code: 'HC-A', schedule_date: '2026-11-10' };
  const b = { ...a, id: 'b', campaign_code: 'HC-B', schedule_date: '2026-11-11' };
  const source = fs.readFileSync(rosterPath('SetupTargetPicker.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let index = 0;
  const react = { useState(initial) { return [index++ === 0 ? { branch: 'q1', items: [a, b] } : initial, () => {}]; }, useEffect() {} };
  const imports = { react, 'react/jsx-runtime': require('react/jsx-runtime'), './setupLinks': load('setupLinks.ts'), '../utils/adminFormatters': { formatDisplayDate: (date) => date } };
  const exports = {};
  new Function('exports', 'require', code)(exports, (name) => imports[rosterImport(name)] ?? {});
  let chosen;
  const props = { branch: 'q1', ids: ['a', 'b'], onChange: (value) => { chosen = value; } };
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const nodes = elements(exports.SetupTargetPicker(props));
  nodes.find((node) => node.props?.onValueChange).props.onValueChange('group');
  assert.deepEqual(chosen.map((item) => item.id), ['a', 'b']);
  nodes.find((node) => node.type === 'input').props.onChange({ target: { checked: false } });
  assert.deepEqual(chosen.map((item) => item.id), ['b']);
  index = 0;
  assert.equal(elements(exports.SetupTargetPicker({ ...props, branch: 'q7' })).some((node) => node.type === 'input'), false);
});

test('database links are atomic, preserve history and branch permissions and cannot point at the wrong HC event', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const a = '00000000-0000-4000-8000-000000000010', b = '00000000-0000-4000-8000-000000000011';
  const other = '00000000-0000-4000-8000-000000000012', wrongBranch = '00000000-0000-4000-8000-000000000013';
  const setup = '00000000-0000-4000-8000-000000000020', legacy = '00000000-0000-4000-8000-000000000021';
  const batch = '00000000-0000-4000-8000-000000000100';
  try {
    await db.exec(`create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${owner}'::uuid $$;
      create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
      create table public.profiles(user_id uuid, role text, is_active boolean, branch text);
      insert into public.profiles values('${owner}','admin',true,'q1');
      create function public.can_manage_roster() returns boolean language sql as $$ select true $$;
      create function public.can_access_branch_code(branch text) returns boolean language sql as $$ select branch='q1' $$;
      create table public.clinic_rooms(id uuid primary key, room_name text, branch_code text, display_order int, is_active boolean, inactive_from date);
      create table public.roster_schedules(id uuid primary key default gen_random_uuid(), schedule_type text, schedule_date date, branch_code text, company_name text, provisional_cost bigint default 0,
        campaign_code text,contact_person text,company_address text,notes text,default_allowance bigint,position_list jsonb not null default '[]'::jsonb,position_order_mode text,sales_person text,departure_address text);
      create table public.roster_assignments(id uuid, schedule_id uuid references public.roster_schedules(id) on delete cascade, room_id uuid);
      create table public.roster_daily_room_overrides(id uuid, schedule_date date, branch_code text, room_id uuid);
      insert into public.roster_schedules(id,schedule_type,schedule_date,branch_code,company_name) values('${legacy}','setup',current_date-1,'q1','Old');
      grant usage on schema auth to authenticated;
      grant select on public.profiles to authenticated;
      grant select,insert,update,delete on public.roster_schedules to authenticated;
      alter table public.roster_schedules enable row level security;
      create policy scope on public.roster_schedules for all to authenticated using(branch_code='q1') with check(branch_code='q1');`);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261104130000_lock_roster_history.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261105100000_link_setup_to_onsite_campaigns.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261105110000_create_hc_with_setup.sql'), 'utf8'));
    await db.exec(`insert into public.roster_schedules(id,schedule_type,schedule_date,branch_code,company_name,campaign_group_id) values
      ('${a}','onsite_exam',current_date+3,'q1','ABC','${batch}'), ('${b}','onsite_exam',current_date+4,'q1','ABC','${batch}'),
      ('${other}','onsite_exam',current_date+5,'q1','ABC',gen_random_uuid()), ('${wrongBranch}','onsite_exam',current_date+3,'q7','ABC',gen_random_uuid());
      set role authenticated;`);
    await assert.rejects(db.exec("insert into public.roster_schedules(schedule_type,schedule_date,branch_code,company_name) values('setup',current_date+1,'q1','ABC')"), /chọn đoàn/);
    await db.query("insert into public.roster_schedules(id,schedule_type,schedule_date,branch_code,company_name,setup_onsite_ids) values($1,'setup',current_date+1,'q1','wrong name',$2::uuid[])", [setup, [a, b]]);
    assert.equal((await db.query('select company_name from public.roster_schedules where id=$1', [setup])).rows[0].company_name, 'ABC');
    assert.equal((await db.query('select * from public.roster_setup_links')).rows.length, 2);
    await assert.rejects(db.query('delete from public.roster_schedules where id=$1', [a]), /lịch set-up/);
    await assert.rejects(db.query("update public.roster_schedules set company_name='Other' where id=$1", [a]), /lịch set-up/);
    await assert.rejects(db.query('update public.roster_schedules set setup_onsite_ids=$1::uuid[] where id=$2', [[a, other], setup]), /cùng một đợt/);
    await assert.rejects(db.query('update public.roster_schedules set setup_onsite_ids=$1::uuid[] where id=$2', [[wrongBranch], setup]), /khác cơ sở/);
    await assert.rejects(db.query('update public.roster_schedules set setup_onsite_ids=$1::uuid[] where id=$2', [[setup], setup]), /không hợp lệ/);
    await assert.rejects(db.exec('delete from public.roster_setup_links'), /permission denied/);
    await assert.rejects(db.query('update public.roster_schedules set setup_onsite_ids=$1::uuid[] where id=$2', [[a], legacy]), /ROSTER_HISTORY_LOCKED/);
    const atomic = '00000000-0000-4000-8000-000000000030';
    await assert.rejects(db.exec(`insert into public.roster_schedules(id,schedule_type,schedule_date,branch_code,company_name,setup_onsite_ids) values
      ('${atomic}','setup',current_date+1,'q1','ABC',array['${a}']::uuid[]),
      (gen_random_uuid(),'setup',current_date+1,'q1','ABC',array['${other}','${a}']::uuid[])`));
    assert.equal((await db.query('select * from public.roster_schedules where id=$1', [atomic])).rows.length, 0);
    await db.query('update public.roster_schedules set setup_onsite_ids=$1::uuid[] where id=$2', [[b], setup]);
    assert.equal((await db.query('select * from public.roster_setup_links')).rows.length, 1);
    await db.query('delete from public.roster_schedules where id=$1', [a]);
    await db.query('delete from public.roster_schedules where id=$1', [setup]);
    assert.equal((await db.query('select * from public.roster_setup_links')).rows.length, 0);
    const dates = (await db.query("select (current_date+10)::text as a,(current_date+11)::text as b,(current_date+9)::text as setup,(current_date-1)::text as past")).rows[0];
    const hc = [dates.a, dates.b].map((date, i) => ({ schedule_type: 'onsite_exam', schedule_date: date, branch_code: 'q1', company_name: 'New Company', campaign_code: `NEW-${i}`, position_list: ['Nội'] }));
    const setups = [{ ...hc[0], schedule_type: 'setup', schedule_date: dates.setup, campaign_code: 'NEW-SETUP', position_list: ['Chuẩn bị bàn'] }];
    const rpc = (hcRows, setupRows) => db.query('select * from public.create_onsite_with_setup($1::jsonb,$2::jsonb)', [JSON.stringify(hcRows), JSON.stringify(setupRows)]);
    await assert.rejects(rpc(hc, setups), /column "position_list" is of type jsonb but expression is of type text\[\]/);
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261108100000_fix_onsite_setup_position_list.sql'), 'utf8'));
    await db.exec('set role authenticated');
    const rows = (await rpc(hc, setups)).rows;
    assert.equal(rows.length, 3);
    const hcRows = rows.filter((row) => row.schedule_type === 'onsite_exam');
    const setupRow = rows.find((row) => row.schedule_type === 'setup');
    assert.equal(hcRows[0].campaign_group_id, hcRows[1].campaign_group_id);
    assert.deepEqual([...setupRow.setup_onsite_ids].sort(), hcRows.map((row) => row.id).sort());
    assert.equal(setupRow.company_name, 'New Company');
    assert.deepEqual(setupRow.position_list, ['Chuẩn bị bàn']);
    assert.deepEqual(hcRows[0].position_list, ['Nội']);
    assert.equal((await db.query('select * from public.roster_setup_links')).rows.length, 2);
    const count = (await db.query('select count(*)::int as n from public.roster_schedules')).rows[0].n;
    await assert.rejects(rpc(hc, [{ ...setups[0], schedule_date: dates.past }]), /ROSTER_HISTORY_LOCKED/);
    await assert.rejects(rpc(hc.map((row) => ({ ...row, branch_code: 'q7' })), setups), /row-level security/);
    await assert.rejects(rpc(hc, []), /ít nhất/);
    await assert.rejects(rpc(hc, [{ ...setups[0], schedule_type: 'blood_draw' }]), /Chỉ tạo mới/);
    await assert.rejects(rpc(hc, [{ ...setups[0], position_list: 'invalid' }]), /scalar/);
    assert.equal((await db.query('select count(*)::int as n from public.roster_schedules')).rows[0].n, count);
  } finally { await db.close(); }
});
