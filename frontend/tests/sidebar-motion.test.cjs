const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, (name) => imports[name] ?? {}, ...Object.values(globals));
  return exports;
}

test('sidebar pointer and keyboard navigation dispatch immediately and retain native modified links', () => {
  const calls = [];
  const location = { origin: 'https://clinic.invalid', href: 'https://clinic.invalid/?page=admin' };
  const window = { location, history: { pushState(_, __, url) { location.href = url.href; calls.push('push'); } },
    dispatchEvent(event) { calls.push(event.type); }, scrollTo() {} };
  const { handleInternalLinkClick, APP_NAVIGATION_EVENT } = load('lib/navigation.ts', {}, { window });
  const event = { defaultPrevented: false, button: 0, detail: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} };
  handleInternalLinkClick(event, '/?page=staff');
  handleInternalLinkClick({ ...event, detail: 0 }, '/?page=roster-onsite');
  assert.deepEqual(calls, ['push', APP_NAVIGATION_EVENT, 'push', APP_NAVIGATION_EVENT]);
  handleInternalLinkClick({ ...event, ctrlKey: true }, '/?page=staff');
  assert.equal(calls.length, 4);
});

test('sidebar uses flat task links in the same order when expanded or collapsed and filters by permission', () => {
  const symbols = new Proxy({}, { get: (_, key) => String(key) });
  const source = fs.readFileSync(path.join(root, 'features/admin/shell/AdminSidebar.tsx'), 'utf8');
  const imports = Object.fromEntries([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => [match[1], symbols]));
  let allowed = null;
  const destinations = { 'roster-dashboard': 'overview', 'roster-insite': 'clinic', 'roster-onsite': 'onsite', 'roster-personnel': 'personnel', 'roster-settlement': 'settlement' };
  imports['../shared/useStaffPermissions'] = { useStaffPermissions: () => ({ can: (key) => !allowed || allowed.includes(key) }), DESTINATION_PERMISSIONS: destinations };
  imports.react = { useRef: () => ({ current: null }), useLayoutEffect() {} };
  imports['react/jsx-runtime'] = require('react/jsx-runtime');
  const { AdminSidebar } = load('features/admin/shell/AdminSidebar.tsx', imports);
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  function render(isCollapsed) {
    return elements(AdminSidebar({ activePage: 'roster-dashboard', branch: 'q1', date: '2026-11-15', staffName: 'Admin', isAdmin: true, themeMode: 'light', isCollapsed }));
  }
  for (const collapsed of [false, true]) {
    const nodes = render(collapsed);
    const links = nodes.filter((node) => node.type === 'a' && node.props.href.includes('page=roster-'));
    assert.deepEqual(links.map((link) => new URL(link.props.href, 'https://clinic.invalid').searchParams.get('page')), Object.keys(destinations));
    assert.equal(links[0].props['aria-current'], 'page');
    assert.ok(links.every((link) => link.props.onClick));
    assert.ok(!nodes.some((node) => node.props?.['aria-controls'] === 'dym-sidebar-roster-panel'));
    assert.ok(!nodes.some((node) => node.type === 'SidebarMenuSub'));
  }
  allowed = ['clinic', 'personnel'];
  const links = render(false).filter((node) => node.type === 'a' && node.props.href.includes('page=roster-'));
  assert.deepEqual(links.map((link) => new URL(link.props.href, 'https://clinic.invalid').searchParams.get('page')), ['roster-insite', 'roster-personnel']);
});

test('active sidebar item is fully revealed on entry and resize without scrolling when already visible', () => {
  const source = fs.readFileSync(path.join(root, 'features/admin/shell/AdminSidebar.tsx'), 'utf8');
  const ast = ts.createSourceFile('sidebar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useLayoutEffect') callback = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  let top = 180, bottom = 216, resize, observed, disconnected = false;
  const content = { clientHeight: 100, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 100, bottom: 200 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top, bottom }) }) };
  class Observer {
    constructor(fn) { resize = fn; }
    observe(node) { observed = node; }
    disconnect() { disconnected = true; }
  }
  const code = ts.transpileModule(`exports.run = ${callback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = {};
  new Function('exports', 'contentRef', 'ResizeObserver', code)(result, { current: content }, Observer);
  const cleanup = result.run();
  assert.equal(content.scrollTop, 24);
  assert.equal(observed, content);
  top = 120; bottom = 156;
  resize();
  assert.equal(content.scrollTop, 24);
  top = 90; bottom = 126;
  resize();
  assert.equal(content.scrollTop, 6);
  cleanup();
  assert.equal(disconnected, true);
});
