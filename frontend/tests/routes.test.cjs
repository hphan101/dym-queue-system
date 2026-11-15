const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/app/routes.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const routes = {};
new Function('exports', code)(routes);
const { resolveAppRoute } = routes;

test('public routes and legacy admin URLs keep their destinations', () => {
  for (const kind of ['login', 'display', 'registration-qr']) {
    assert.deepEqual(resolveAppRoute('/' + kind, ''), { kind });
    assert.deepEqual(resolveAppRoute('/', '?page=' + kind), { kind });
  }
  const entries = { admin: 'dashboard', staff: 'staff', registrations: 'registrations', roster: 'roster-dashboard', 'roster-dashboard': 'roster-dashboard', 'roster-insite': 'roster-insite', 'roster-onsite': 'roster-onsite', 'roster-personnel': 'roster-personnel', 'roster-settlement': 'roster-settlement' };
  for (const [page, destination] of Object.entries(entries)) {
    assert.deepEqual(resolveAppRoute('/' + page + '/', ''), { kind: 'admin', destination });
    assert.deepEqual(resolveAppRoute('/', '?page=' + page + '&branch=hn&date=2026-11-15'), { kind: 'admin', destination });
  }
});

test('specific roster/staff routes win over the generic admin prefix; unknown routes remain registration', () => {
  for (const destination of ['staff', 'registrations', 'roster-personnel', 'roster-onsite', 'roster-insite', 'roster-settlement']) {
    assert.deepEqual(resolveAppRoute('/admin/' + destination, ''), { kind: 'admin', destination });
  }
  assert.deepEqual(resolveAppRoute('/admin/roster', ''), { kind: 'admin', destination: 'roster-dashboard' });
  assert.deepEqual(resolveAppRoute('/admin', '?page=registration-qr'), { kind: 'registration-qr' });
  assert.deepEqual(resolveAppRoute('/', '?branch=q1'), { kind: 'registration' });
  assert.deepEqual(resolveAppRoute('/unknown', '?page=unknown'), { kind: 'registration' });
});
