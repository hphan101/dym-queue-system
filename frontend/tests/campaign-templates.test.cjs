const { rosterPath, rosterImport } = require('./helpers/roster-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(rosterPath(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, (name) => imports[rosterImport(name)]);
  return exports;
}
const specialties = load('doctorSpecialties.ts', {});
const service = load('rosterService.ts', { './doctorSpecialties': specialties, '../../../lib/supabaseClient': { supabase: {} } });

test('shared templates load per type, validate edits and save separately from campaign positions', async () => {
  let write, error = null;
  const api = load('campaignTemplates.ts', { './rosterService': service, '../../../lib/supabaseClient': { supabase: {
    from(table) { assert.equal(table, 'roster_position_templates'); return {
      select: async () => ({ data: [{ schedule_type: 'setup', positions: ['Lắp thiết bị'] }], error }),
      upsert: async (payload) => { write = payload; return { error }; },
    }; },
  } } });
  const templates = await api.fetchCampaignTemplates();
  assert.deepEqual(templates.setup, ['Lắp thiết bị']);
  assert.equal(templates.onsite_exam.length, 11);
  assert.deepEqual(service.CAMPAIGN_POSITION_TEMPLATES.setup, []);
  assert.deepEqual(await api.saveCampaignTemplate('blood_draw', [' Tiếp nhận ', 'Lấy mẫu']), ['Tiếp nhận', 'Lấy mẫu']);
  assert.equal(write.schedule_type, 'blood_draw');
  assert.deepEqual(write.positions, ['Tiếp nhận', 'Lấy mẫu']);
  assert.deepEqual(api.validatePositionList([]), []);
  for (const positions of [[''], ['A', ' A '], ['x'.repeat(201)], Array.from({ length: 101 }, (_, i) => `${i}`)]) {
    await assert.rejects(api.saveCampaignTemplate('setup', positions));
  }
  error = { message: 'Offline' };
  await assert.rejects(api.fetchCampaignTemplates(), /Offline/);
  await assert.rejects(api.saveCampaignTemplate('setup', []), /Offline/);
});

test('database templates seed all three types, enforce admin writes and leave saved campaigns untouched', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role service_role;
      create function public.can_manage_roster() returns boolean language sql as $$ select current_setting('app.role', true) in ('admin','operator') $$;
      create function public.is_admin() returns boolean language sql as $$ select current_setting('app.role', true) = 'admin' $$;
      create table public.roster_schedules(id int, position_list text[]);
      insert into public.roster_schedules values(1, array['Đoàn đã lưu']);`);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261105090000_add_campaign_position_templates.sql'), 'utf8'));
    const rows = (await db.query('select schedule_type,positions from public.roster_position_templates')).rows;
    for (const row of rows) assert.deepEqual(row.positions, service.CAMPAIGN_POSITION_TEMPLATES[row.schedule_type]);
    await db.exec("set role authenticated; set app.role='operator'");
    assert.equal((await db.query('select * from public.roster_position_templates')).rows.length, 3);
    assert.equal((await db.query("update public.roster_position_templates set positions=array['Không được sửa'] where schedule_type='setup' returning *")).rows.length, 0);
    await assert.rejects(db.exec("insert into public.roster_position_templates values('setup', array['A'], now())"));
    await db.exec("set app.role='admin'; update public.roster_position_templates set positions=array['Chuẩn bị bàn'] where schedule_type='setup'");
    await assert.rejects(db.exec("update public.roster_position_templates set positions=array['A', ' A '] where schedule_type='setup'"));
    await assert.rejects(db.exec("update public.roster_position_templates set positions=array[''] where schedule_type='setup'"));
    await db.exec("set app.role='receptionist'");
    assert.equal((await db.query('select * from public.roster_position_templates')).rows.length, 0);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select position_list from public.roster_schedules')).rows[0].position_list, ['Đoàn đã lưu']);
  } finally { await db.close(); }
});
