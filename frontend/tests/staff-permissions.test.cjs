const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { PERMISSION_MODULES, PERMISSION_ACTIONS, getDefaultPermissions, parsePermissions, hasPermission } = require('./helpers/staff-permissions.cjs');

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
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/components/StaffPermissionMatrix.tsx'), 'utf8');
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies = { '@/components/ui/button': { Button: 'button' }, '@/lib/staffPermissions': require('./helpers/staff-permissions.cjs'), 'react/jsx-runtime': require('react/jsx-runtime') };
  new Function('exports', 'require', code)(exports, (name) => dependencies[name]);
  let value = getDefaultPermissions('none');
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const render = () => nodes(exports.StaffPermissionMatrix({ value, disabled: false, onChange(next) { value = next; } }));
  render().find((node) => node.props?.['aria-label'] === 'Lịch tại Phòng khám: Thêm').props.onChange({ target: { checked: true } });
  assert.ok(value.clinic.create && value.clinic.view);
  render().find((node) => node.props?.['aria-label'] === 'Lịch tại Phòng khám: Xem').props.onChange({ target: { checked: false } });
  assert.ok(Object.values(value.clinic).every((allowed) => !allowed));
  assert.ok(parsePermissions(value));
  render().find((node) => node.type === 'button' && node.props.children === 'Chỉ xem').props.onClick();
  assert.ok(Object.entries(value).every(([key, row]) => (key === 'printing' ? !row.view : row.view) && PERMISSION_ACTIONS.filter((action) => action !== 'view').every((action) => !row[action])));
  render().find((node) => node.props?.title === 'Chọn hoặc bỏ cả cột Xóa').props.onClick();
  assert.ok(PERMISSION_MODULES.filter((module) => module.actions.includes('delete')).every(({ key }) => value[key].delete && value[key].view));
  assert.ok(parsePermissions(value));
});

test('database matrix enforces grants, denied mutations and branch scope through real migrations', async () => {
  const db = new PGlite();
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
    `);
    const directory = path.resolve(__dirname, '../../supabase/migrations');
    for (const file of fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
      if (file.includes('bootstrap_initial_admin')) continue;
      const sql = fs.readFileSync(path.join(directory, file), 'utf8')
        .replace(/create extension if not exists (pgcrypto|pg_trgm);/gi, '')
        .replace(/create index[^;]*gin_trgm_ops[^;]*;/gi, '');
      try { await db.exec(sql); } catch (error) { throw new Error(`${file}: ${error.message}`); }
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
    await db.query(`update public.profiles set is_active=false where user_id=$1`, [user]);
    assert.equal((await db.query(`select public.has_permission('clinic') as allowed`)).rows[0].allowed, false);
  } finally { await db.close(); }
});
