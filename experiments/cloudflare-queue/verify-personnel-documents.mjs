import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getDefaultPermissions } from '../../supabase/functions/_shared/staffPermissions.ts';

const base = process.env.ROSTER_PREVIEW_URL ?? 'http://127.0.0.1:8799';
const outerPassword = process.env.ROSTER_PREVIEW_PASSWORD ?? (base === 'http://127.0.0.1:8799' ? 'local-check-only' : '');
assert.ok(outerPassword);
const appUser = process.env.ROSTER_APPLICATION_USER;
const authorization = appUser ? {} : { Authorization: 'Basic ' + Buffer.from('demo:' + outerPassword).toString('base64') };
const headers = { ...authorization, Origin: base };
const docs = '/functions/v1/personnel-documents';
const suffix = randomUUID().slice(0, 8).toUpperCase();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3sQAAAAASUVORK5CYII=', 'base64');

function send(path, { method = 'GET', body, cookie, extra } = {}) {
  return fetch(base + path, { method, body, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extra } });
}
const json = (path, method, data, cookie) => send(path, {
  method, body: data === undefined ? undefined : JSON.stringify(data), cookie,
  extra: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
});
const login = async (loginName, password) => {
  const r = await json('/functions/v1/login', 'POST', { loginName, password });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('Set-Cookie').split(';')[0];
};
const admin = await login(appUser ?? 'demo', outerPassword);
const staff = (method, data, cookie = admin) => json('/functions/v1/manage-staff', method, data, cookie);
const personnel = (query, method, data) => json('/rest/v1/medical_personnel' + query, method, data, admin);
const created = await personnel('', 'POST', {
  personnel_code: (appUser ? 'BS_' : 'BS-THU-') + suffix,
  full_name: (appUser ? 'Nguyễn Hoàng Mẫu ' : 'Bác sĩ thử tệp ') + suffix, role_type: 'doctor',
  ...(appUser ? { identity_number: '079090999999', practicing_certificate: 'CCHN số 100/A', phone_number: '0990000000' } : {}),
});
assert.equal(created.status, 201, await created.clone().text());
const [person] = await created.json();
const location = '?personnelId=' + person.id;
const fileName = (appUser ? 'Chứng chỉ hành nghề ' : 'DEMO-') + suffix + '.png';
const upload = ({ name = fileName, body = png, cookie = admin } = {}) =>
  send(docs + location + '&kind=certificate', { method: 'POST', cookie, body, extra: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent(name) } });

let file;
let viewer;
try {
  assert.equal((await send(docs + location)).status, 401);
  assert.equal((await upload({ name: appUser ? '../other.png' : 'other.png' })).status, 400);
  assert.equal((await upload({ body: Buffer.from('not a PNG') })).status, 400);
  assert.equal((await upload({ body: Buffer.alloc(10 * 1024 * 1024 + 1) })).status, 413);
  const concurrent = await Promise.all([upload(), upload()]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 201]);
  const [a, b] = await Promise.all(concurrent.map(r => r.json()));
  assert.equal(a.id, b.id);
  file = docs + '?id=' + a.id;
  const list = await send(docs + location, { cookie: admin });
  assert.deepEqual((await list.json()).map(row => row.id), [a.id]);
  const personDelete = await personnel('?id=eq.' + person.id, 'DELETE');
  assert.equal(personDelete.status, 409);
  assert.equal((await personDelete.json()).code, '23503');

  const download = await send(file, { cookie: admin });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('Content-Type'), 'image/png');
  assert.equal(download.headers.get('Cache-Control'), 'no-store');
  assert.equal(decodeURIComponent(download.headers.get('Content-Disposition').split("''")[1]), fileName);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  assert.equal((await send(file)).status, 401);

  const permissions = getDefaultPermissions('none');
  permissions.personnel.view = true;
  permissions.personnel_documents.view = true;
  const loginName = (appUser ? 'hoso.' : 'demo-docs-') + suffix.toLowerCase();
  const password = randomUUID();
  const account = await staff('POST', {
    action: 'create', loginName, password, displayName: (appUser ? 'Nhân viên Hồ Sơ ' : 'Người xem thử ') + suffix, role: 'operator',
    branchCodes: ['q1'], permissions, canEditRosterHistory: false,
  });
  assert.equal(account.status, 201, await account.clone().text());
  viewer = (await (await staff('GET')).json()).staff.find(row => row.loginName === loginName).userId;
  const session = await login(loginName, password);
  assert.equal((await send(file, { cookie: session })).status, 200);
  assert.equal((await upload({ cookie: session })).status, 403);
  assert.equal((await send(file, { method: 'DELETE', cookie: session })).status, 403);
  const reset = await staff('POST', { action: 'reset-password', userId: viewer, password: randomUUID() });
  assert.equal(reset.status, 200);
  assert.equal((await send(file, { cookie: session })).status, 401);

  assert.equal((await send(file, { method: 'DELETE', cookie: admin })).status, 204);
  assert.equal((await send(file, { method: 'DELETE', cookie: admin })).status, 204);
  assert.equal((await send(file, { cookie: admin })).status, 404);
  assert.deepEqual(await (await send(docs + location, { cookie: admin })).json(), []);
  console.log('PASS private upload/open/delete, 10 MB limit, duplicate upload, view-only access and FK protection');
} finally {
  if (file) await send(file, { method: 'DELETE', cookie: admin });
  await personnel('?id=eq.' + person.id, 'DELETE');
  if (viewer) await staff('POST', { action: 'delete', userId: viewer });
}
