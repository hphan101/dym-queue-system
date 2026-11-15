const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/accounts/staffApi.ts'), 'utf8').replaceAll('import.meta.env', 'testEnv');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function loadApi(auth, fetch) {
  const exports = {};
  new Function('exports', 'require', 'fetch', 'testEnv', code)(exports,
    name => { assert.equal(name, '@/lib/supabaseClient'); return { supabase: { auth } }; }, fetch,
    { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' });
  return exports;
}
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('staff API preserves payloads and retries a rejected token once after refresh', async () => {
  let refreshed = 0;
  const calls = [];
  const { requestStaffApi } = loadApi({ getSession: async () => ({ data: { session: { access_token: 'old' } } }),
    refreshSession: async () => { refreshed++; return { data: { session: { access_token: 'new' } } }; } },
  async (url, options) => { calls.push({ url, ...options }); return response(calls.length === 1 ? 401 : 200, { success: true, staff: [] }); });
  const body = { action: 'update', permissions: { clinic: { view: true } }, branchCodes: ['hn'] };
  assert.deepEqual(await requestStaffApi('POST', body), { success: true, staff: [] });
  assert.equal(refreshed, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, 'Bearer old');
  assert.equal(calls[1].headers.Authorization, 'Bearer new');
  assert.ok(calls.every(call => call.url === 'https://example.invalid/functions/v1/manage-staff' && call.method === 'POST' && call.body === JSON.stringify(body)));
});

test('staff API refreshes nearly expired sessions and rejects absent or failed sessions before fetching', async () => {
  let refreshed = 0, fetched = 0;
  const auth = { getSession: async () => ({ data: { session: { access_token: 'old', expires_at: Date.now() / 1000 + 10 } } }),
    refreshSession: async () => { refreshed++; return { data: { session: { access_token: 'fresh' } } }; } };
  const { requestStaffApi } = loadApi(auth, async (_, options) => { fetched++; assert.equal(options.headers.Authorization, 'Bearer fresh'); assert.equal(options.body, undefined); return response(200, { success: true }); });
  await requestStaffApi('GET');
  assert.equal(refreshed, 1);
  assert.equal(fetched, 1);
  const absent = loadApi({ getSession: async () => ({ data: { session: null } }) }, () => assert.fail('No session must not fetch'));
  await assert.rejects(absent.requestStaffApi('GET'), /AUTH_REQUIRED/);
  const failed = loadApi({ ...auth, refreshSession: async () => ({ error: new Error('expired'), data: { session: null } }) }, async () => response(401, {}));
  await assert.rejects(failed.requestStaffApi('GET'), /AUTH_REQUIRED/);
});

test('staff API preserves server errors, non-JSON failures and network failures', async () => {
  const auth = { getSession: async () => ({ data: { session: { access_token: 'valid' } } }) };
  const denied = loadApi(auth, async () => response(400, { success: false, code: 'PERMISSION_API_NOT_READY' }));
  await assert.rejects(denied.requestStaffApi('POST', {}), /PERMISSION_API_NOT_READY/);
  const invalid = loadApi(auth, async () => ({ status: 403, ok: false, json: async () => { throw new Error('html'); } }));
  await assert.rejects(invalid.requestStaffApi('GET'), /ORIGIN_NOT_ALLOWED/);
  const offline = loadApi(auth, async () => { throw new Error('offline'); });
  await assert.rejects(offline.requestStaffApi('GET'), /offline/);
  assert.match(denied.apiErrorMessage('PERMISSION_API_NOT_READY'), /database/);
  assert.match(denied.apiErrorMessage('UNEXPECTED_CODE'), /UNEXPECTED_CODE/);
});
