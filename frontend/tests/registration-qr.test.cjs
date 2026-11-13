const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://test.invalid'))
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', JSON.stringify('public-test-key'));
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  mocks = { '@/lib/staffPermissions': require('./helpers/staff-permissions.cjs'), '../_shared/staffPermissions.ts': require('./helpers/staff-permissions.cjs'), ...mocks };
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    crypto: webcrypto, TextEncoder, Uint8Array, Date, Request, Response, Headers, console, ...globals,
  });
  return exports;
}

const cryptoHelpers = load('supabase/functions/_shared/registrationAccess.ts');
const now = Date.UTC(2026, 10, 1, 9, 0, 0);
const secret = 'test-only-server-signing-secret';

test('moving the frontend permits only its exact configured origin and preserves existing origins', () => {
  const env = { ALLOWED_ORIGINS: 'https://old.example.test,http://localhost:5173', PUBLIC_APP_ORIGIN: 'https://queue.pages.dev' };
  const http = load('supabase/functions/_shared/http.ts', {}, { Deno: { env: { get: (key) => env[key] } } });
  for (const origin of ['https://queue.pages.dev', 'https://old.example.test', 'http://localhost:5173']) assert.equal(http.isOriginAllowed(origin), true);
  for (const origin of ['https://queue.pages.dev.attacker.test', 'https://other.pages.dev', 'http://queue.pages.dev']) assert.equal(http.isOriginAllowed(origin), false);
  assert.equal(http.responseHeaders('https://queue.pages.dev').get('Access-Control-Allow-Origin'), 'https://queue.pages.dev');
});

test('shared Bearer parsing preserves staff and QR authorization header handling', () => {
  const { getBearerToken } = load('supabase/functions/_shared/http.ts');
  for (const [header, expected] of [[undefined, null], ['Basic token', null], ['Bearer', null],
    ['Bearer staff-token', 'staff-token'], ['bearer staff-token', 'staff-token'], ['Bearer   staff-token', 'staff-token']]) {
    const request = new Request('https://test.invalid', { headers: header ? { Authorization: header } : {} });
    assert.equal(getBearerToken(request), expected);
  }
});

test('missing QR deployment is reported distinctly from a network failure', async () => {
  const api = load('frontend/src/features/registration/registrationAccessApi.ts', {}, {
    fetch: async () => new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }),
  });
  await assert.rejects(api.requestRegistrationAccess({ action: 'qr', branch: 'q1' }, new AbortController().signal, 'staff-token'),
    (error) => error instanceof api.RegistrationAccessError && error.code === 'QR_SERVICE_NOT_DEPLOYED');
});

test('QR menu opens a new staff tab for the selected branch and leaves reception in place', () => {
  let navigatedTo;
  let detached = false;
  const session = new Map([['dym-staff-auth', 'existing-staff-session']]);
  const navigation = load('frontend/src/lib/navigation.ts', {}, {
    URL, Event,
    window: { location: { origin: 'https://clinic.invalid', href: 'https://clinic.invalid/?page=admin&branch=q7' },
      open: (url, target) => {
        assert.equal(url, 'about:blank'); assert.equal(target, '_blank');
        return { set opener(value) { detached = value === null; }, location: { replace: (href) => { navigatedTo = new URL(href); } } };
      },
      history: { pushState() { throw new Error('Reception must remain open'); } }, dispatchEvent() {}, scrollTo() {},
      sessionStorage: { getItem: (key) => session.get(key) } },
  });
  const symbols = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  const source = fs.readFileSync(path.join(root, 'frontend/src/features/admin/AdminSidebar.tsx'), 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const mocks = Object.fromEntries(imports.map((name) => [name, symbols]));
  mocks['./hooks/useStaffPermissions'] = { useStaffPermissions: () => ({ can: () => true }), DESTINATION_PERMISSIONS: new Proxy({}, { get: () => 'clinic' }) };
  mocks.react = { useState: (initial) => [initial, () => {}] };
  mocks['./hooks/useSidebarDisclosureMotion'] = { useSidebarDisclosureMotion: () => ({ panelRef: { current: null }, prepare() {} }) };
  mocks['./sidebarMotion.css'] = {};
  mocks['react/jsx-runtime'] = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  mocks['../../lib/navigation'] = navigation;
  mocks['../../config/branches'] = { BRANCH_NAMES: { q1: 'Quận 1', q7: 'Quận 7', hn: 'Hà Nội' } };
  const { AdminSidebar } = load('frontend/src/features/admin/AdminSidebar.tsx', mocks);
  const tree = AdminSidebar({ activePage: 'dashboard', branch: 'q7', staffName: 'Lễ tân',
    isAdmin: false, staffRole: 'receptionist', themeMode: 'light', isCollapsed: false });
  const find = (node) => {
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button' && node.props['aria-label'] === 'Mở màn hình QR đăng ký') return node;
    return find(node.props?.children);
  };
  const link = find(tree);
  assert.ok(link);
  link.props.onClick();
  assert.equal(detached, true);
  assert.equal(navigatedTo.pathname, '/registration-qr');
  assert.equal(navigatedTo.searchParams.get('branch'), 'q7');
  assert.equal(session.get('dym-staff-auth'), 'existing-staff-session');
});

test('QRs are branch-bound, rotate each minute and expire exactly after 90 seconds', async () => {
  const qr = await cryptoHelpers.createQrChallenge('q1', secret, now);
  const same = await cryptoHelpers.createQrChallenge('q1', secret, now + 59_000);
  assert.equal(qr.challenge, same.challenge);
  assert.notEqual(qr.challenge, (await cryptoHelpers.createQrChallenge('q1', secret, now + 60_000)).challenge);
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, secret, now + 89_999), 'q1');
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, secret, now + 90_000), null);
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, secret, now - 1), null);
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge.replace('.q1.', '.q7.'), secret, now), null);
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, 'wrong-secret', now), null);
  assert.equal(await cryptoHelpers.verifyQrChallenge('not-a-qr', secret, now), null);
});

test('registration opens a same-origin tab, detaches its opener, and falls back when popups are blocked', () => {
  const events = [];
  let blocked = false;
  const newTab = { location: { replace: (url) => events.push(['navigate', url]) },
    set opener(value) { events.push(['opener', value]); } };
  const navigation = load('frontend/src/lib/navigation.ts', {}, { URL, Event,
    window: { location: { origin: 'https://clinic.invalid', href: 'https://clinic.invalid/?page=admin' },
      open: (url, target) => { events.push(['open', url, target]); return blocked ? null : newTab; },
      history: { pushState: (_, __, url) => events.push(['fallback', url.href]) }, dispatchEvent() {}, scrollTo() {},
    },
  });
  navigation.openStaffTab('/?branch=q7&staff=1');
  assert.deepEqual(events, [
    ['open', 'about:blank', '_blank'], ['opener', null], ['navigate', 'https://clinic.invalid/?branch=q7&staff=1'],
  ]);
  events.length = 0;
  navigation.openStaffTab('https://outside.invalid/');
  assert.equal(events.length, 0);
  blocked = true;
  navigation.openStaffTab('/?branch=hn&staff=1');
  assert.equal(events[1][0], 'fallback');
  assert.equal(events[1][1], 'https://clinic.invalid/?branch=hn&staff=1');
});

test('assisted registration requires active staff and a server-authorized branch before exchanging a QR', async () => {
  let session = null;
  let profile = { role: 'receptionist', is_active: true };
  let branchAllowed = true;
  const calls = [];
  const api = load('frontend/src/features/registration/registrationAccessApi.ts');
  const chain = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: profile }; } };
  const helper = load('frontend/src/features/registration/staffRegistrationAccess.ts', {
    '../../lib/supabaseClient': { supabase: { auth: { getSession: async () => ({ data: { session } }) }, from: () => chain } },
    './registrationAccessApi': { ...api, requestRegistrationAccess: async (body, signal, token) => {
      calls.push({ body, token });
      assert.equal(signal.aborted, false);
      if (body.action === 'qr') {
        assert.equal(token, 'existing-staff-token');
        if (!branchAllowed) throw new api.RegistrationAccessError('ACCESS_DENIED');
        return { branch: body.branch, challenge: 'server-signed-challenge' };
      }
      assert.equal(body.challenge, 'server-signed-challenge');
      return { branch: body.branch, sessionToken: 'a'.repeat(64) };
    } },
  });
  const run = () => helper.requestStaffRegistrationSession('q7', new AbortController().signal);
  await assert.rejects(run(), { code: 'AUTH_REQUIRED' });
  assert.equal(calls.length, 0);
  session = { user: { id: 'staff' }, access_token: 'existing-staff-token' };
  profile.is_active = false;
  await assert.rejects(run(), { code: 'ACCESS_DENIED' });
  profile = { role: 'operator', is_active: true, permissions: require('./helpers/staff-permissions.cjs').getDefaultPermissions('none') };
  await assert.rejects(run(), { code: 'ACCESS_DENIED' });
  assert.equal(calls.length, 0);
  profile.role = 'receptionist';
  profile.permissions = null;
  branchAllowed = false;
  await assert.rejects(run(), { code: 'ACCESS_DENIED' });
  assert.equal(calls.length, 1);
  branchAllowed = true;
  const result = await run();
  assert.equal(result.branch, 'q7');
  assert.deepEqual(calls.map((call) => call.body.action), ['qr', 'qr', 'exchange']);
  assert.equal(calls[2].body.branch, 'q7');
  profile.role = 'admin';
  assert.equal((await run()).sessionToken, 'a'.repeat(64));
});

test('staff links request a fresh authorized session, while public links still require a QR', async () => {
  for (const assisted of [false, true]) {
    const effects = [], states = [];
    let staffRequests = 0;
    const now = Date.now();
    const api = load('frontend/src/features/registration/registrationAccessApi.ts');
    const helper = load('frontend/src/features/registration/useRegistrationAccess.ts', {
      react: { useState: (value) => [value, (next) => states.push(next)], useEffect: (effect) => effects.push(effect), useCallback: (fn) => fn },
      './registrationAccessApi': { ...api, requestRegistrationAccess: () => { throw new Error('No public QR supplied'); } },
      './registrationSession': { readRegistrationSession: () => null, storeRegistrationSession: () => { throw new Error('Do not persist staff capability'); }, clearRegistrationSession() {} },
      './staffRegistrationAccess': { requestStaffRegistrationSession: async (branch) => {
        staffRequests++;
        return { branch, sessionToken: 'b'.repeat(64), expiresAt: new Date(now + 1_200_000).toISOString(), serverNow: new Date(now).toISOString() };
      } },
    }, { URL, URLSearchParams, AbortController,
      window: { setTimeout: () => 1, clearTimeout() {}, location: { hash: '', href: 'https://clinic.invalid/?branch=q7&staff=1' }, history: { replaceState() {} } },
    });
    helper.useRegistrationAccess('q7', assisted);
    const cleanup = effects[0]();
    await new Promise(setImmediate);
    assert.equal(staffRequests, assisted ? 1 : 0);
    assert.equal(states.at(-1).status, assisted ? 'ready' : 'required');
    if (assisted) assert.equal(states.at(-1).assisted, true);
    cleanup();
  }
});

test('a shared QR supports multiple scans, each issuing a different opaque session', async () => {
  const qr = await cryptoHelpers.createQrChallenge('hn', secret, now);
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, secret, now + 1000), 'hn');
  assert.equal(await cryptoHelpers.verifyQrChallenge(qr.challenge, secret, now + 2000), 'hn');
  const one = cryptoHelpers.createRegistrationSessionToken();
  const two = cryptoHelpers.createRegistrationSessionToken();
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.notEqual(one, two);
  assert.notEqual(await cryptoHelpers.hashRegistrationSession(one), one);
});

test('session restoration rejects expired, malformed and wrong-branch tokens without storing patient data', () => {
  let value = null;
  const helper = load('frontend/src/features/registration/registrationSession.ts', {}, {
    sessionStorage: { getItem: () => value, setItem: (_, next) => { value = next; }, removeItem: () => { value = null; } },
  });
  helper.storeRegistrationSession({ branch: 'q1', token: 'a'.repeat(64), expiresAt: now + 1_200_000 });
  assert.equal(helper.readRegistrationSession('q1', now).token, 'a'.repeat(64));
  assert.equal(helper.readRegistrationSession('q7', now), null);
  assert.equal(helper.readRegistrationSession('q1', now + 1_200_000), null);
  helper.clearRegistrationSession();
  assert.equal(helper.readRegistrationSession('q1', now), null);
  value = '{broken';
  assert.equal(helper.readRegistrationSession('q1', now), null);
});

test('server refuses public QR issuance, wrong staff branches and invalid exchange requests', async () => {
  let handler;
  let databaseCalls = 0;
  let hasAccess = false;
  const chain = { select() { return this; }, eq() { return this; }, async maybeSingle() {
    return { data: hasAccess ? { branch_id: 'branch-q1' } : null, error: null };
  } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'staff' } }, error: null }) },
    from(table) {
      databaseCalls++;
      if (table === 'staff_branch_access') return chain;
      return { ...chain, async maybeSingle() {
        return { data: table === 'profiles' ? { role: 'receptionist', is_active: true } : { id: 'branch-q1' }, error: null };
      } };
    },
    rpc: async () => ({ error: null }),
  };
  const Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://test.invalid', REGISTRATION_FINGERPRINT_SECRET: secret })[key] }, serve: (fn) => { handler = fn; } };
  const http = load('supabase/functions/_shared/http.ts', {}, { Deno });
  load('supabase/functions/registration-access/index.ts', {
    '../_shared/http.ts': http,
    '../_shared/supabase.ts': { createAdminClient: () => client, getSupabaseSecretKey: () => 'server-secret' },
    '../_shared/registrationAccess.ts': cryptoHelpers,
  }, { Deno });
  const call = (body, auth) => handler(new Request('https://test.invalid/access', {
    method: 'POST', headers: auth ? { Authorization: 'Bearer staff-token' } : {}, body: JSON.stringify(body),
  }));
  assert.equal((await call({ action: 'qr', branch: 'q1' })).status, 401);
  assert.equal(databaseCalls, 0);
  assert.equal((await call({ action: 'qr', branch: 'q1' }, true)).status, 403);
  hasAccess = true;
  assert.equal((await call({ action: 'qr', branch: 'q1' }, true)).status, 200);
  assert.equal((await call({ action: 'exchange', branch: 'q1', challenge: 'forged' })).status, 403);
  const current = await cryptoHelpers.createQrChallenge('q1', secret);
  assert.equal((await call({ action: 'exchange', branch: 'q7', challenge: current.challenge })).status, 403);
});

test('register endpoint has no QR bypass and delegates issuance to the atomic session RPC', async () => {
  let handler;
  const calls = [];
  const Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://test.invalid', REGISTRATION_FINGERPRINT_SECRET: secret })[key] }, serve: (fn) => { handler = fn; } };
  const http = load('supabase/functions/_shared/http.ts', {}, { Deno });
  const client = { rpc: async (name, args) => {
    calls.push({ name, args });
    return name === 'consume_registration_ip_limit' ? { data: [{ allowed: true }], error: null }
      : { data: [{ registration_id: 'patient', queue_number: '0001', queue_date: '2026-11-01' }], error: null };
  } };
  load('supabase/functions/register/index.ts', {
    '../_shared/http.ts': http,
    '../_shared/supabase.ts': { createAdminClient: () => client, getSupabaseSecretKey: () => 'server-secret' },
    '../_shared/registrationAccess.ts': cryptoHelpers,
  }, { Deno });
  const payload = { branch: 'q1', fullName: 'Nguyễn Văn A', phoneNumber: '0901234567', birthDate: '2000-01-01',
    gender: 'Nam', cccd: 'B1234567', province: 'Hà Nội', ward: 'Cầu Giấy', addressDetail: '123 đường A' };
  const call = (data) => handler(new Request('https://test.invalid/register', { method: 'POST', body: JSON.stringify(data) }));
  assert.equal((await call(payload)).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await call({ ...payload, registrationSession: 'forged' })).status, 403);
  const response = await call({ ...payload, registrationSession: 'a'.repeat(64) });
  assert.equal(response.status, 200);
  assert.equal(calls[1].name, 'issue_registration_with_session');
  assert.equal(calls[1].args.p_session_hash, await cryptoHelpers.hashRegistrationSession('a'.repeat(64)));
  assert.equal(calls.some((call) => call.name === 'issue_registration'), false);
});

test('Postgres migration issues once, rejects expired or mismatched sessions and rolls back failed submissions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.branches (id uuid primary key, code text, is_active boolean default true);
      create table public.registrations (
        id uuid primary key default gen_random_uuid(), queue_number integer, queue_date date default current_date,
        registered_at timestamptz default now()
      );
      create or replace function public.issue_registration(
        text, text, date, text, text, text, text, text, text, text, text, integer, jsonb
      ) returns table(registration_id uuid, queue_number text, queue_date date, registered_at timestamptz)
      language plpgsql as $$ declare r public.registrations%rowtype; begin
        insert into public.registrations(queue_number) values ((select count(*)+1 from public.registrations)) returning * into r;
        if $2 = 'FAIL' then raise exception 'INVALID_DATA'; end if;
        return query select r.id, lpad(r.queue_number::text,4,'0'), r.queue_date, r.registered_at;
      end; $$;
      insert into public.branches values ('00000000-0000-4000-8000-000000000001','q1',true);
    `);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261101090000_add_registration_qr_sessions.sql'), 'utf8'));
    const issue = (token, branch = 'q1', name = 'Valid name', requestHash = 'e'.repeat(64)) => db.query(`
      select * from public.issue_registration_with_session($1,$4,$2,$3,'2000-01-01','Nam','0901234567',
        'B1234567','','Hà Nội','Cầu Giấy','123 đường A','fingerprint',600,'{}'::jsonb)
    `, [token, branch, name, requestHash]);
    const add = (hash, interval = '20 minutes') => db.query(`insert into public.registration_access_sessions(token_hash,branch_id,expires_at)
      values($1,'00000000-0000-4000-8000-000000000001',now()+$2::interval)`, [hash, interval]);
    const hash = 'a'.repeat(64);
    await add(hash);
    const results = await Promise.all([issue(hash), issue(hash)]);
    assert.equal(results[0].rows[0].registration_id, results[1].rows[0].registration_id);
    await assert.rejects(issue(hash, 'q1', 'Different patient', 'f'.repeat(64)), /REGISTRATION_SESSION_USED/);
    assert.equal((await db.query('select count(*)::int as n from public.registrations')).rows[0].n, 1);
    await assert.rejects(issue('b'.repeat(64)), /REGISTRATION_SESSION_INVALID/);
    await assert.rejects(issue(hash, 'q7'), /REGISTRATION_SESSION_INVALID/);
    const expired = 'c'.repeat(64);
    await add(expired, '-1 second');
    await assert.rejects(issue(expired), /REGISTRATION_SESSION_EXPIRED/);
    const retry = 'd'.repeat(64);
    await add(retry);
    await assert.rejects(issue(retry, 'q1', 'FAIL'), /INVALID_DATA/);
    assert.equal((await db.query('select count(*)::int as n from public.registrations')).rows[0].n, 1);
    assert.equal((await db.query('select registration_id from public.registration_access_sessions where token_hash=$1', [retry])).rows[0].registration_id, null);
    await issue(retry);
    assert.equal((await db.query('select count(*)::int as n from public.registrations')).rows[0].n, 2);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.registration_access_sessions'), /permission denied/);
    await assert.rejects(issue(hash), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
