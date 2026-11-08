const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

function loadService(rpc) {
  const file = path.resolve(__dirname, '../src/features/admin/receptionNotes.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, () => ({ supabase: { rpc } }));
  return exports;
}

test('notes save only after server confirmation, retain leading zeroes and surface failures/conflicts', async () => {
  let resolve, args;
  const service = loadService((name, input) => {
    assert.equal(name, 'update_registration_reception_note'); args = input;
    return new Promise((done) => { resolve = done; });
  });
  const request = service.saveReceptionNote('patient', ' 0012\nĐoàn ABC ', 'old');
  assert.equal(args.p_note, '0012\nĐoàn ABC');
  assert.equal(args.p_expected_note, 'old');
  resolve({ data: '0012\nĐoàn ABC', error: null });
  assert.equal(await request, '0012\nĐoàn ABC');
  await assert.rejects(service.saveReceptionNote('patient', 'x'.repeat(501), ''));
  await assert.rejects(loadService(async () => ({ error: { message: 'offline' } })).saveReceptionNote('patient', 'draft', ''), /Chưa lưu/);
  await assert.rejects(loadService(async () => ({ error: { message: 'NOTE_CHANGED' } })).saveReceptionNote('patient', 'draft', ''), /máy khác/);
  await assert.rejects(loadService(async () => ({ data: null, error: null })).saveReceptionNote('patient', 'draft', ''), /Chưa xác nhận/);
});

test('leaving a note saves once; failed saves preserve the draft for retry; unchanged notes do not write', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/components/ReceptionNoteCell.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const states = []; let index = 0, finish, requests = 0;
  const pending = { current: false };
  const mocks = {
    react: { useRef: () => pending, useState(initial) { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value) => { states[slot] = value; }]; } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': { Pencil: 'Pencil' }, '@/components/ui/button': { Button: 'Button' }, './HighlightText': { HighlightText: 'HighlightText' },
    '../receptionNotes': { saveReceptionNote: async () => { requests++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); } },
  };
  const exports = {};
  new Function('exports', 'require', code)(exports, (name) => mocks[name]);
  let saved = 'old';
  const render = () => { index = 0; return exports.ReceptionNoteCell({ id: 'patient', name: 'Test', value: saved, onSaved: (value) => { saved = value; } }); };
  render().props.onClick();
  assert.equal(render().props.children[0].type, 'textarea');
  render().props.children[0].props.onBlur();
  assert.equal(requests, 0);
  render().props.onClick();
  render().props.children[0].props.onChange({ target: { value: '0012' } });
  const field = render().props.children[0];
  field.props.onBlur(); field.props.onBlur();
  assert.equal(requests, 1);
  finish.reject(new Error('offline'));
  await new Promise(setImmediate);
  assert.equal(render().props.children[0].props.value, '0012');
  assert.equal(saved, 'old');
  render().props.children[0].props.onBlur();
  assert.equal(requests, 2);
  finish.resolve('0012');
  await new Promise(setImmediate);
  assert.equal(saved, '0012');
  assert.equal(render().type, 'button');
});

test('database notes enforce branch access, bound length, reject stale writes and preserve medical/print data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create type public.registration_state as enum('active','completed','cancelled');
      create table branches(id uuid primary key, code text, is_active boolean default true);
      create table test_access(user_id uuid, branch_id uuid, active boolean default true);
      create function public.can_access_branch(target uuid) returns boolean language sql as $$ select exists(select 1 from public.test_access where user_id=auth.uid() and branch_id=target and active) $$;
      create table registrations(id uuid primary key, branch_id uuid, queue_date date, queue_number int, registered_at timestamptz, full_name text, birth_date date, gender text, phone_number text, identity_document text, company_name text, province text, ward text, address_detail text, state registration_state, first_called_at timestamptz, last_called_at timestamptz, tt25_data jsonb, updated_at timestamptz);
      create table audit_logs(branch_id uuid, actor_id uuid, action text, entity_type text, entity_id uuid);
      create function public.get_registration_details(text,date) returns void language sql as $$ select $$;
      insert into branches values('00000000-0000-0000-0000-000000000001','q1',true),('00000000-0000-0000-0000-000000000002','q7',true);
      insert into test_access values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',true);
      insert into registrations(id,branch_id,queue_date,queue_number,tt25_data) values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','2026-11-08',1,'{"printedConsent":true,"medicalHistory":{"test":true}}');
    `);
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261108090000_add_reception_notes.sql'), 'utf8'));
    const patient = '00000000-0000-0000-0000-000000000004';
    const save = (note, expected) => db.query('select public.update_registration_reception_note($1,$2,$3) as note', [patient, note, expected]);
    assert.equal((await db.query("select has_function_privilege('anon','public.update_registration_reception_note(uuid,text,text)','EXECUTE') as allowed")).rows[0].allowed, false);
    await assert.rejects(save('unauthenticated', ''), /AUTH_REQUIRED/);
    await db.query("select set_config('test.uid',$1,false)", ['00000000-0000-0000-0000-000000000003']);
    assert.equal((await save(' 0012 ', '')).rows[0].note, '0012');
    assert.equal((await save('0012', '')).rows[0].note, '0012'); // lost-response retry
    await assert.rejects(save('stale', ''), /NOTE_CHANGED/);
    await assert.rejects(save('x'.repeat(501), '0012'), /NOTE_TOO_LONG/);
    const details = await db.query("select * from public.get_registration_details('q1','2026-11-08')");
    assert.equal(details.rows[0].reception_note, '0012');
    assert.equal(details.rows[0].tt25_data.printedConsent, true);
    assert.deepEqual(details.rows[0].tt25_data.medicalHistory, { test: true });
    await assert.rejects(db.query("select * from public.get_registration_details('q7','2026-11-08')"), /ACCESS_DENIED/);
    await db.exec('update test_access set active=false');
    await assert.rejects(save('revoked', '0012'), /ACCESS_DENIED/);
    await db.exec('update test_access set active=true');
    assert.equal((await save('', '0012')).rows[0].note, '');
    assert.equal((await db.query('select count(*)::int as count from audit_logs')).rows[0].count, 2);
  } finally { await db.close(); }
});
