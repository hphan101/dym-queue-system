const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('production builds reject missing Vite variables before publishing a blank application', () => {
  const frontend = path.resolve(__dirname, '..');
  const code = ts.transpileModule(fs.readFileSync(path.join(frontend, 'vite.config.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  let env = {};
  const mocks = {
    'node:path': path,
    vite: { defineConfig: (config) => config, loadEnv: (_mode, directory) => { assert.equal(directory, frontend); return env; } },
    '@vitejs/plugin-react': () => ({}),
  };
  const exports = {};
  new Function('exports', 'require', '__dirname', code)(exports, (name) => mocks[name], frontend);
  assert.throws(() => exports.default({ command: 'build', mode: 'production' }), /VITE_SUPABASE_URL/);
  env = { VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: ' ', VITE_REGISTRATION_API_URL: 'https://test.invalid/register' };
  assert.throws(() => exports.default({ command: 'build', mode: 'production' }), /VITE_SUPABASE_PUBLISHABLE_KEY/);
  env.VITE_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  assert.doesNotThrow(() => exports.default({ command: 'build', mode: 'production' }));
  env = {};
  assert.doesNotThrow(() => exports.default({ command: 'serve', mode: 'development' }));
});
