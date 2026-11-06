const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(env) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/_shared/supabase.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {}, errors = [];
  new Function('exports', 'require', 'Deno', 'console', code)(exports, () => ({}), { env: { get: (key) => env[key] } }, { error: (message) => errors.push(JSON.parse(message)) });
  return { ...exports, errors };
}

test('Supabase key parsing preserves precedence, fallback and exact error codes without logging keys', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'legacy', SUPABASE_SECRET_KEYS: '{bad', SUPABASE_ANON_KEY: 'anon', SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'publishable' }) };
  const api = load(env);
  assert.equal(api.getSupabaseSecretKey(), 'legacy');
  assert.deepEqual(api.errors, []);
  assert.equal(api.getSupabasePublishableKey(), 'publishable');
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(api.getSupabaseSecretKey(), null);
  assert.deepEqual(api.errors, [{ code: 'INVALID_SUPABASE_SECRET_KEYS' }]);
  for (const value of ['null', '{bad', '{}', '{"default":3}', '{"default":""}']) {
    env.SUPABASE_PUBLISHABLE_KEYS = value;
    assert.equal(api.getSupabasePublishableKey(), 'anon');
  }
  env.SUPABASE_SECRET_KEYS = '{"default":"secret"}';
  assert.equal(api.getSupabaseSecretKey(), 'secret');
  env.SUPABASE_ANON_KEY = '';
  assert.equal(api.getSupabasePublishableKey(), '');
  delete env.SUPABASE_ANON_KEY;
  assert.equal(api.getSupabasePublishableKey(), null);
  assert.ok(api.errors.every((entry) => Object.keys(entry).length === 1 && entry.code.startsWith('INVALID_SUPABASE_')));
});
