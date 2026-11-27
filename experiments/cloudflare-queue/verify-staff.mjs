import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getDefaultPermissions } from '../../supabase/functions/_shared/staffPermissions.ts';

const base = process.env.ROSTER_PREVIEW_URL ?? 'http://127.0.0.1:8797';
const outerPassword = process.env.ROSTER_PREVIEW_PASSWORD ?? (base === 'http://127.0.0.1:8797' ? 'local-check-only' : '');
assert.ok(outerPassword);
const appUser = process.env.ROSTER_APPLICATION_USER;
const authorization = appUser ? {} : { Authorization: 'Basic ' + Buffer.from('demo:' + outerPassword).toString('base64') };
const suffix = randomUUID().slice(0, 8);
const loginName = (appUser ? 'nhanvien.' : 'demo-staff-') + suffix;
const password = 'Test-only-' + randomUUID();
const rotated = 'Test-only-' + randomUUID();
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format();

async function request(path, method = 'GET', body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...authorization, Origin: base, Prefer: 'return=representation',
      'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  return { status: response.status, headers: response.headers, body: raw ? JSON.parse(raw) : null };
}
const fn = (name, method, body, cookie) => request('/functions/v1/' + name, method, body, cookie);
const api = (name, method, body, cookie) => request('/rest/v1/' + name, method, body, cookie);
async function login(name, pass) {
  const result = await fn('login', 'POST', { loginName: name, password: pass });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.headers.get('set-cookie').split(';')[0];
}
const admin = await login(appUser ?? 'demo', outerPassword);
const manage = (body, cookie = admin) => fn('manage-staff', body ? 'POST' : 'GET', body, cookie);
const adminRooms = (path, method, body) => api('clinic_rooms' + path, method, body, admin);
const permissions = getDefaultPermissions('none');
permissions.reception.view = true;
permissions.clinic.view = true;
permissions.overview.view = true;
permissions.registration_qr.view = true;
const info = {
  loginName, displayName: (appUser ? 'Lễ tân Mô Phỏng ' : 'Lễ tân thử ') + suffix, role: 'receptionist', branchCodes: ['q7'],
  canEditRosterHistory: false, permissions,
};
const roomIds = [];
let id;
try {
  const created = await manage({ action: 'create', password, ...info });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const staff = (await manage()).body.staff;
  const person = staff.find(item => item.loginName === loginName);
  assert.ok(person);
  id = person.userId;
  assert.equal(created.body.userId, id);
  if (appUser) {
    assert.equal((await manage({ action: 'create', ...info, password })).status, 409);
    assert.equal((await manage({ action: 'create', ...info, loginName: 'demo', password })).status, 400);
  }
  assert.deepEqual(person.branches.map(branch => branch.code), ['q7']);
  assert.equal('password_hash' in person, false);
  const session = await login(loginName, password);
  assert.equal((await fn('preview-session', 'GET', undefined, session)).body.user.id, id);
  const access = await api('staff_branch_access', 'GET', undefined, session);
  assert.equal(access.status, 200, JSON.stringify(access.body));
  assert.deepEqual(access.body.map(branch => branch.branch_id), ['q7']);
  assert.deepEqual((await api('profiles?user_id=eq.preview-staff', 'GET', undefined, session)).body, []);
  assert.equal((await manage(undefined, session)).status, 403);
  for (const branch of ['q1', 'q7']) {
    const room = await adminRooms('', 'POST', { branch_code: branch, room_name: 'Phòng thử quyền ' + suffix });
    assert.equal(room.status, 201, JSON.stringify(room.body));
    roomIds.push(room.body[0].id);
  }
  const limitedRooms = (await api('clinic_rooms', 'GET', undefined, session)).body;
  assert.ok(limitedRooms.some(row => row.id === roomIds[1]));
  assert.ok(!limitedRooms.some(row => row.id === roomIds[0]));
  assert.equal((await api('clinic_rooms?id=eq.' + roomIds[1], 'PATCH', { display_order: 53 }, session)).status, 403);
  assert.equal((await api('rpc/get_dashboard_registrations', 'POST', { p_branch_code: 'q7', p_queue_date: today }, session)).status, 200);
  assert.equal((await api('rpc/get_dashboard_registrations', 'POST', { p_branch_code: 'q1', p_queue_date: today }, session)).status, 403);
  assert.equal((await api('rpc/get_dashboard_registrations', 'POST', { p_branch_code: 'hn', p_queue_date: today }, session)).status, 403);
  const missingNotice = branch => `/api/${branch}/registration-notice?id=${suffix.padEnd(36, '0')}`;
  assert.equal((await request(missingNotice('q7'), 'GET', undefined, session)).status, 404);
  assert.equal((await request(missingNotice('hn'), 'GET', undefined, session)).status, 403);
  assert.equal((await request('/api/hn/events?staff=1', 'GET', undefined, session)).status, 403);
  assert.equal((await api('rpc/get_registration_details', 'POST', { p_branch_code: 'q7', p_queue_date: today }, session)).status, 403);
  assert.equal((await api('rpc/call_next_queue', 'POST', { p_branch_code: 'q7' }, session)).status, 403);
  assert.equal((await fn('registration-access', 'POST', { branch: 'q1', action: 'qr' }, session)).status, 403);
  assert.equal((await fn('registration-access', 'POST', { branch: 'q7', action: 'qr' }, session)).status, 200);
  assert.equal((await api('rpc/get_reception_trend', 'POST', { p_branch_code: null, p_year: Number(today.slice(0, 4)) }, session)).status, 200);
  assert.equal((await api('rpc/get_reception_trend', 'POST', { p_branch_code: 'q1', p_year: Number(today.slice(0, 4)) }, session)).status, 403);
  console.log('PASS per-account session, branch scoping, module checks and read/write separation');

  permissions.clinic.update = true;
  assert.equal((await manage({ action: 'update', userId: id, ...info })).status, 200);
  assert.equal((await api('clinic_rooms?id=eq.' + roomIds[1], 'PATCH', { display_order: 53 }, session)).status, 200);
  assert.equal((await api('clinic_rooms?id=eq.' + roomIds[0], 'PATCH', { display_order: 53 }, session)).status, 403);
  assert.equal((await manage({ action: 'reset-password', userId: id, password: rotated })).status, 200);
  assert.equal((await api('profiles', 'GET', undefined, session)).status, 401);
  assert.equal((await request(missingNotice('q7'), 'GET', undefined, session)).status, 401);
  assert.equal((await fn('login', 'POST', { loginName, password })).status, 401);
  const newSession = await login(loginName, rotated);
  assert.equal((await manage({ action: 'set-active', userId: id, isActive: false })).status, 200);
  assert.equal((await api('profiles', 'GET', undefined, newSession)).status, 401);
  assert.equal((await fn('login', 'POST', { loginName, password: rotated })).status, 401);
  assert.equal((await manage({ action: 'set-active', userId: id, isActive: true })).status, 200);
  assert.equal((await api('profiles', 'GET', undefined, newSession)).status, 401);
  const unlocked = await login(loginName, rotated);
  assert.equal((await manage({ action: 'delete', userId: id })).status, 200);
  id = null;
  assert.equal((await api('profiles', 'GET', undefined, unlocked)).status, 401);
  assert.equal((await manage({ action: 'delete', userId: 'preview-staff' })).status, 403);
  console.log('PASS edited permissions apply right away, password reset and locking revoke sessions, deletion and admin protection');
} finally {
  if (id) await manage({ action: 'delete', userId: id });
  for (const roomId of roomIds) await adminRooms('?id=eq.' + roomId, 'DELETE');
}
