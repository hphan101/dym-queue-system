import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.ROSTER_PREVIEW_URL ?? 'http://127.0.0.1:8791';
const password = process.env.ROSTER_PREVIEW_PASSWORD ?? (base === 'http://127.0.0.1:8791' ? 'local-check-only' : '');
assert.ok(password, 'Set ROSTER_PREVIEW_PASSWORD to the staging password.');
const appUser = process.env.ROSTER_APPLICATION_USER;
const authorization = appUser ? {} : { Authorization: 'Basic ' + Buffer.from('demo:' + password).toString('base64') };
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format();
const time = date => new Date(Date.parse(day) + date * 86400000).toISOString().slice(0, 10);
const lead = 180 + Math.floor(Math.random() * 730);
const date = time(lead);
const suffix = randomUUID().slice(0, 8);
const cleanup = [];

async function call(path, { method = 'GET', body, cookie, origin = base, single = false, prefer } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...authorization, Origin: origin, 'Content-Type': 'application/json',
      Prefer: prefer ? `return=representation,${prefer}` : 'return=representation', ...(cookie ? { Cookie: cookie } : {}),
      ...(single ? { Accept: 'application/vnd.pgrst.object+json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
}
const rest = (path, options) => call('/rest/v1/' + path, options);
function success(result) {
  assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.data));
  return result.data;
}
assert.equal((await rest('roster_schedules', { method: 'POST', body: {} })).status, 401);
const login = await call('/functions/v1/login', { method: 'POST', body: { loginName: appUser ?? 'demo', password } });
success(login);
const cookie = login.headers.get('set-cookie').split(';')[0];
const get = async path => success(await rest(path, { cookie }));
async function write(path, method, body, single = false) {
  return success(await rest(path, { method, body, cookie, single }));
}
async function create(path, body) {
  const row = await write(path, 'POST', body, true);
  cleanup.push([path, row.id]);
  return row;
}
async function remove(resource, id) {
  const filter = Array.isArray(id) ? 'in.(' + id.join(',') + ')' : 'eq.' + id;
  await write(resource + '?id=' + filter, 'DELETE');
}

try {
  const doctor = appUser ? await create('medical_personnel', {
    personnel_code: 'BS_' + suffix.toUpperCase(), full_name: 'Phạm Văn Mẫu', role_type: 'doctor', fixed_cost: 1500000,
  }) : null;
  const importEndpoint = 'medical_personnel?on_conflict=personnel_code';
  const sample = Array.from({ length: 105 }, (_, index) => ({
    personnel_code: `THU-${suffix.toUpperCase()}-${index + 1}`, full_name: `Nhân sự thử ${suffix} ${index + 1}`,
    role_type: 'nurse', fixed_cost: 800000,
  }));
  const merge = 'resolution=merge-duplicates';
  const imported = success(await rest(importEndpoint, { method: 'POST', body: sample, cookie, prefer: merge }));
  const importedFilter = 'medical_personnel?id=in.(' + imported.map(row => row.id).join(',') + ')';
  cleanup.push(['medical_personnel', imported.map(row => row.id)]);
  assert.equal(imported.length, sample.length);
  const revised = sample.map(item => ({ ...item, fixed_cost: 850000 }));
  const invalid = [...revised.slice(0, -1), { ...revised.at(-1), role_type: 'invalid' }];
  assert.equal((await rest(importEndpoint, { method: 'POST', body: invalid, cookie, prefer: merge })).status, 400);
  assert.deepEqual((await get(importedFilter)).map(item => item.fixed_cost), Array(sample.length).fill(800000));
  const updated = success(await rest(importEndpoint, { method: 'POST', body: revised, cookie, prefer: merge }));
  assert.deepEqual(updated.map(row => row.id), imported.map(row => row.id));
  assert.deepEqual((await get(importedFilter)).map(item => item.fixed_cost), Array(sample.length).fill(850000));
  console.log('PASS bulk import and same-code update for 105 personnel, including rollback of an invalid batch');

  const rooms = await get('clinic_rooms?branch_code=eq.q7');
  const room = await create('clinic_rooms', { branch_code: 'q7', room_name: 'Phòng thử ' + suffix });
  assert.equal((await get('clinic_rooms?branch_code=eq.q7')).length, rooms.length + 1);
  const schedule = await create('roster_schedules', { schedule_type: 'insite', branch_code: 'q7', schedule_date: date, company_name: 'DYM thử' });
  await Promise.all([
    write('roster_schedules?id=eq.' + schedule.id, 'PATCH', { provisional_cost: 168000, position_list: ['fixed:' + room.id] }, true),
    write('roster_schedules?id=eq.' + schedule.id, 'PATCH', { notes: 'Ghi chú thử song song' }, true),
  ]);
  const [saved] = await get('roster_schedules?id=eq.' + schedule.id);
  assert.equal(saved.provisional_cost, 168000);
  assert.equal(saved.notes, 'Ghi chú thử song song');
  const person = doctor ?? (await get('medical_personnel?role_type=eq.doctor'))[0];
  const assignment = { schedule_id: schedule.id, room_id: room.id, personnel_id: person.id, position_label: '',
    shift_period: 'AM', start_minute: 435, end_minute: 735, day_rate_snapshot: 1500000, base_cost_snapshot: 937500, allowance_cost: 0 };
  const first = await create('roster_assignments', assignment);
  await write('roster_assignments?id=eq.' + first.id, 'PATCH', { note: 'Ca thử ' + suffix, allowance_cost: 10000 }, true);
  const [savedAssignment] = await get('roster_assignments?id=eq.' + first.id);
  assert.equal(savedAssignment.total_cost, 947500);
  assert.equal(savedAssignment.note, 'Ca thử ' + suffix);
  const override = await create('roster_daily_room_overrides', {
    schedule_date: date, branch_code: 'q7', override_type: 'add', room_id: null, custom_room_name: 'Phòng tạm ' + suffix, display_order: 200,
  });
  assert.equal((await get('roster_daily_room_overrides?id=eq.' + override.id))[0].custom_room_name, override.custom_room_name);
  assert.equal((await rest('roster_schedules?id=eq.' + schedule.id, { method: 'PATCH', body: { notes: 'Phải bị chặn' }, cookie, origin: 'http://127.0.0.1:8789' })).status, 403);
  assert.equal((await rest('roster_schedules', { method: 'POST', body: { schedule_type: 'insite', branch_code: 'q7', schedule_date: time(-1) }, cookie })).status, 403);
  console.log('PASS clinic room, assignment, cost, historical lock and origin check');

  const hc = { schedule_type: 'onsite_exam', branch_code: 'q7', schedule_date: date, campaign_code: 'DEMO-HC-' + suffix, company_name: 'Công ty thử ' + suffix, position_list: ['Khám'] };
  const setup = { ...hc, schedule_type: 'setup', campaign_code: 'DEMO-SETUP-' + suffix, schedule_date: time(lead - 1), position_list: [] };
  const beforeFailure = await get('roster_schedules?campaign_code=eq.' + hc.campaign_code);
  assert.equal(beforeFailure.length, 0);
  assert.equal((await rest('rpc/create_onsite_with_setup', { method: 'POST', body: { p_hc: [hc], p_setup: [{ ...setup, schedule_date: time(-1) }] }, cookie })).status, 403);
  assert.equal((await get('roster_schedules?campaign_code=eq.' + hc.campaign_code)).length, 0);
  const [campaign, setupSchedule] = await write('rpc/create_onsite_with_setup', 'POST', { p_hc: [hc], p_setup: [setup] });
  cleanup.push(['roster_schedules', campaign.id], ['roster_schedules', setupSchedule.id]);
  const [link] = await get('roster_setup_links?onsite_id=eq.' + campaign.id);
  assert.equal(link.setup_id, setupSchedule.id);
  const onsite = { ...assignment, schedule_id: campaign.id, room_id: null, position_label: 'Khám',
    day_rate_snapshot: null, start_minute: null, end_minute: null, base_cost_snapshot: 700000 };
  assert.equal((await rest('roster_assignments', { method: 'POST', body: onsite, cookie })).status, 409);
  await create('roster_assignments', { ...onsite, shift_period: 'PM', start_minute: 735, end_minute: 975,
    day_rate_snapshot: 1500000, base_cost_snapshot: 750000 });
  await write('roster_schedules?id=eq.' + campaign.id, 'PATCH', { notes: 'Đã chỉnh ' + suffix, default_allowance: 25000 }, true);
  const [actual] = await get('roster_schedules?id=eq.' + campaign.id + '&schedule_type=neq.insite');
  assert.equal(actual.notes, 'Đã chỉnh ' + suffix);
  assert.equal(actual.default_allowance, 25000);
  assert.equal((await rest('roster_schedules?id=eq.' + campaign.id, { method: 'DELETE', cookie })).status, 409);
  console.log('PASS onsite write, setup linking, atomic rejection, no overlap and adjacent slot');

  const cloneInput = { ...hc, campaign_code: 'DEMO-CLONE-' + suffix };
  const cloneShift = { personnel_id: person.id, position_label: 'Khám', shift_period: 'PM',
    start_minute: 735, end_minute: 975, day_rate_snapshot: 1500000, base_cost_snapshot: 750000, allowance_cost: 25000 };
  const cloneRoute = 'rpc/create_onsite_with_assignments';
  const overlappingClone = await rest(cloneRoute, { method: 'POST', body: { p_schedule: cloneInput, p_assignments: [cloneShift] }, cookie });
  assert.equal(overlappingClone.status, 409);
  assert.equal(overlappingClone.data.code, '23P01');
  assert.deepEqual(await get('roster_schedules?campaign_code=eq.' + cloneInput.campaign_code), []);
  const clone = await write(cloneRoute, 'POST', { p_schedule: { ...cloneInput, schedule_date: time(lead + 1) }, p_assignments: [cloneShift] });
  cleanup.push(['roster_schedules', clone.schedule.id]);
  assert.equal(clone.insertedAssignments.length, 1);
  const copied = clone.insertedAssignments[0];
  assert.equal(copied.schedule_id, clone.schedule.id);
  for (const [key, value] of Object.entries(cloneShift)) assert.equal(copied[key], value);
  assert.equal(copied.total_cost, 775000);
  console.log('PASS onsite clone preserves timed shifts and rolls back the new schedule if a shift overlaps');
} finally {
  for (const [resource, id] of cleanup.reverse()) await remove(resource, id);
}
