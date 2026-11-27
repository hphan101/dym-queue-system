import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultPermissions } from '../../supabase/functions/_shared/staffPermissions.ts';
import { previewPersonnelDocuments } from './personnel-documents.mjs';
import { rosterPreviewApi } from './roster.mjs';
import { loadRosterSnapshot } from './roster-snapshot.mjs';

const require = createRequire(process.argv[2] ? resolve(process.argv[2]) : import.meta.url);
const { getPlatformProxy } = require('wrangler');
const local = await getPlatformProxy({
  configPath: fileURLToPath(new URL('./wrangler.staging.jsonc', import.meta.url)),
  persist: false, remoteBindings: false,
});
try {
  const { env } = local;
  const { DB, PERSONNEL_FILES } = env;
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const rosterDdl = schema.slice(schema.indexOf('create table if not exists preview_roster_samples'));
  await DB.batch(rosterDdl.split(';').filter(sql => sql.trim()).map(sql => DB.prepare(sql)));

  const morning = '2026-10-26';
  const onsiteDay = '2026-10-27';
  const savedAt = '2026-10-25T19:30:00Z';
  const staff = { id: 'staff-test', role: 'admin', branches: ['q1', 'q7'], canEditHistory: true };
  const person = { id: randomUUID(), personnel_code: 'BS-THU-IMPORT', full_name: 'Bác sĩ thử', role_type: 'doctor', fixed_cost: 2_000_000, created_at: savedAt };
  const room = { id: randomUUID(), branch_code: 'q7', room_name: 'Phòng thử', display_order: 10 };
  const override = { id: randomUUID(), branch_code: 'q7', schedule_date: morning, room_id: null, override_type: 'add', custom_room_name: 'Phòng tạm thử', display_order: 20 };
  const clinic = { id: randomUUID(), schedule_type: 'insite', branch_code: 'q7', schedule_date: morning, provisional_cost: 180_000 };
  const onsite = { id: randomUUID(), schedule_type: 'onsite_exam', branch_code: 'q7', schedule_date: onsiteDay,
    campaign_code: 'DEMO-IMPORT-HC', company_name: 'Công ty thử', position_list: ['Bác sĩ'], default_allowance: 50_000 };
  const setup = { ...onsite, id: randomUUID(), schedule_type: 'setup', campaign_code: 'DEMO-IMPORT-SETUP', schedule_date: morning };
  const priorSetup = { ...setup, id: randomUUID(), campaign_code: 'DEMO-IMPORT-SETUP-LEGACY' };
  for (const schedule of [clinic, onsite, setup, priorSetup]) {
    schedule.campaign_group_id = randomUUID();
    schedule.setup_onsite_ids = schedule === setup ? [onsite.id] : [];
    schedule.created_at = savedAt;
  }
  const timed = { id: randomUUID(), schedule_id: clinic.id, room_id: null, daily_override_id: override.id, personnel_id: person.id,
    shift_period: 'AM', start_minute: 435, end_minute: 735, day_rate_snapshot: 1_500_000,
    base_cost_snapshot: 937_500, allowance_cost: 50_000, total_cost: 987_500, created_at: savedAt };
  const legacy = { id: randomUUID(), schedule_id: onsite.id, room_id: null, daily_override_id: null, personnel_id: person.id,
    shift_period: 'PM', position_label: 'Bác sĩ', start_minute: null, end_minute: null, day_rate_snapshot: null,
    base_cost_snapshot: 700_000, allowance_cost: 50_000, total_cost: 750_000, created_at: savedAt };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3sQAAAAASUVORK5CYII=', 'base64');
  const docs = ['CCCD thử.png', 'Chứng chỉ O\'Brien thử.png'].map((file_name, index) => {
    const kind = index ? 'certificate' : 'identity';
    return { id: randomUUID(), personnel_id: person.id, kind, file_name,
      object_path: person.id + '/' + kind + '/source-object.png', file_size: png.length, mime_type: 'image/png', created_at: savedAt };
  });
  const unavailability = { id: randomUUID(), personnel_id: person.id, unavailable_date: morning, start_minute: 780, end_minute: 900 };
  const snapshot = {
    medical_personnel: [person], clinic_rooms: [room], roster_schedules: [clinic, onsite, setup, priorSetup],
    roster_assignments: [timed, legacy], roster_daily_room_overrides: [override],
    roster_position_templates: [{ schedule_type: 'onsite_exam', positions: ['Bác sĩ', 'Điều dưỡng'], updated_at: savedAt }],
    roster_setup_links: [{ setup_id: setup.id, onsite_id: onsite.id }], personnel_documents: docs,
    roster_unavailability: [unavailability],
  };
  const total = async () => (await DB.prepare(
    'select (select count(*) from preview_roster_samples) as roster, (select count(*) from preview_personnel_documents) as documents',
  ).first());
  const path = row => 'imported-personnel/' + row.id;
  await assert.rejects(loadRosterSnapshot(env, { ...snapshot, roster_setup_links: [] }, () => png), /set-up links/);
  await assert.rejects(loadRosterSnapshot(env, { ...snapshot, roster_unavailability: [{ ...unavailability, personnel_id: randomUUID() }] }, () => png), /missing personnel/);
  await assert.rejects(loadRosterSnapshot(env, { ...snapshot, roster_assignments: [{ ...timed, total_cost: 1 }] }, () => png), /cost totals/);
  await assert.rejects(loadRosterSnapshot(env, snapshot, key => key === docs[0].object_path ? png : null), /missing or has a different size/);
  assert.deepEqual(await total(), { roster: 0, documents: 0 });
  assert.equal((await PERSONNEL_FILES.head(path(docs[0]))).size, png.length);
  const different = Uint8Array.from(png, byte => byte ^ 1);
  await PERSONNEL_FILES.put(path(docs[1]), different, { httpMetadata: { contentType: 'image/png' } });
  await assert.rejects(loadRosterSnapshot(env, snapshot, () => png), /differs from the source/);
  assert.deepEqual(Buffer.from(await (await PERSONNEL_FILES.get(path(docs[1]))).arrayBuffer()), Buffer.from(different));
  assert.deepEqual(await total(), { roster: 0, documents: 0 });
  await PERSONNEL_FILES.delete(path(docs[1]));
  assert.deepEqual(await loadRosterSnapshot(env, snapshot, () => png), { rosterRecords: 11, personnelDocuments: 2 });
  await assert.rejects(loadRosterSnapshot(env, snapshot, () => png), /empty database/);
  assert.deepEqual(await total(), { roster: 11, documents: 2 });

  async function roster(path, init) {
    const url = new URL('https://example.test/' + path);
    const result = await rosterPreviewApi(new Request(url, init), DB, url.pathname.slice(1), url, '2026-11-25', Date.now(), staff);
    assert.ok(result.ok, await result.clone().text());
    return result.json();
  }
  const assignments = await roster('roster_assignments');
  const saved = assignments.find(item => item.id === timed.id);
  assert.equal(saved.day_rate_snapshot, 1_500_000);
  assert.equal(saved.total_cost, 987_500);
  assert.equal(saved.daily_override_id, override.id);
  assert.equal(assignments.find(item => item.id === legacy.id).total_cost, 750_000);
  assert.equal(assignments.find(item => item.id === legacy.id).start_minute, null);
  assert.deepEqual(await roster('roster_setup_links'), [{ onsite_id: onsite.id, setup_id: setup.id }]);
  assert.equal((await roster('roster_schedules?id=eq.' + setup.id))[0].setup_targets[0].onsite.id, onsite.id);
  assert.equal((await roster('roster_schedules?id=eq.' + clinic.id))[0].provisional_cost, 180_000);
  assert.deepEqual((await roster('roster_position_templates'))[0].positions, ['Bác sĩ', 'Điều dưỡng']);
  const [block] = await roster('roster_unavailability?personnel_id=eq.' + person.id);
  assert.deepEqual({ id: block.id, personnel_id: block.personnel_id, unavailable_date: block.unavailable_date,
    start_minute: block.start_minute, end_minute: block.end_minute }, unavailability);
  assert.equal((await roster('roster_schedules?id=eq.' + priorSetup.id, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: '{"notes":"Đã sửa lịch set-up cũ."}',
  }))[0].notes, 'Đã sửa lịch set-up cũ.');

  const fileRequest = new Request('https://example.test/documents?id=' + docs[1].id);
  assert.equal((await previewPersonnelDocuments(fileRequest, env, null)).status, 401);
  assert.equal((await previewPersonnelDocuments(fileRequest, env, { ...staff, permissions: getDefaultPermissions('none') })).status, 403);
  const download = await previewPersonnelDocuments(fileRequest, env, staff);
  assert.equal(download.status, 200);
  assert.equal(decodeURIComponent(download.headers.get('Content-Disposition').split("''")[1]), docs[1].file_name);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  assert.equal((await previewPersonnelDocuments(new Request(fileRequest, { method: 'DELETE' }), env, staff)).status, 204);
  assert.equal(await PERSONNEL_FILES.head(path(docs[1])), null);
  console.log('PASS local D1 and R2 snapshot, missing or changed object retry, legacy schedules and protected file access');
} finally {
  await local.dispose();
}
