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

test('sidebar disclosure animates only opacity and transform on opening and skips keyboard/reduced motion', () => {
  const refs = [], animations = [];
  let cursor = 0, effect, height = 144, opacity = '1', reduce = false, cancelled = 0;
  const react = { useRef(value) { return refs[cursor++] ??= { current: value }; }, useLayoutEffect(fn) { effect = fn; } };
  const view = { matchMedia: () => ({ matches: reduce }), getComputedStyle: () => ({ opacity, getPropertyValue: () => 'cubic-bezier(0.23, 1, 0.32, 1)' }) };
  const panel = { ownerDocument: { defaultView: view }, scrollHeight: 144, getBoundingClientRect: () => ({ height }), animate(frames, options) {
    animations.push({ frames, options }); return { cancel: () => cancelled++ };
  } };
  const { useSidebarDisclosureMotion } = load('features/admin/hooks/useSidebarDisclosureMotion.ts', { react });
  function render(open) { cursor = 0; return useSidebarDisclosureMotion(open); }
  let hook = render(true);
  hook.panelRef.current = panel;
  assert.equal(effect(), undefined);
  hook.prepare(1);
  hook = render(false);
  const cleanup = effect();
  assert.equal(cleanup, undefined);
  assert.equal(animations.length, 0);
  height = 60; opacity = '0.4';
  hook.prepare(1);
  hook = render(true);
  const stop = effect();
  assert.deepEqual(animations[0].frames, [
    { opacity: 0, transform: 'translateY(-4px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ]);
  assert.equal(animations[0].options.duration, 180);
  stop();
  assert.equal(cancelled, 1);
  hook.prepare(0); render(false); assert.equal(effect(), undefined);
  reduce = true;
  hook.prepare(1); render(true); assert.equal(effect(), undefined);
  assert.equal(animations.length, 1);
});

test('sidebar navigation opts into motion only for plain pointer clicks and retains native modified links', () => {
  const dataset = {}, calls = [];
  const location = { origin: 'https://clinic.invalid', href: 'https://clinic.invalid/?page=admin' };
  const window = { location, history: { pushState(_, __, url) { location.href = url.href; calls.push('push'); } },
    dispatchEvent() { calls.push(dataset.navigationMotion); }, scrollTo() {} };
  const { handleInternalLinkClick } = load('lib/navigation.ts', {}, { window, document: { documentElement: { dataset } } });
  const event = { defaultPrevented: false, button: 0, detail: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} };
  handleInternalLinkClick(event, '/?page=staff');
  assert.equal(dataset.navigationMotion, 'pointer');
  handleInternalLinkClick({ ...event, detail: 0 }, '/?page=roster-onsite');
  assert.equal(dataset.navigationMotion, 'instant');
  assert.deepEqual(calls, ['push', 'pointer', 'push', 'instant']);
  handleInternalLinkClick({ ...event, ctrlKey: true }, '/?page=staff');
  assert.equal(calls.length, 4);
});

test('closed sidebar menus are inert and hidden from assistive technology while their exit animation runs', () => {
  const symbols = new Proxy({}, { get: (_, key) => String(key) });
  const source = fs.readFileSync(path.join(root, 'features/admin/AdminSidebar.tsx'), 'utf8');
  const imports = Object.fromEntries([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => [match[1], symbols]));
  imports.react = { useState: () => [false, () => {}] };
  imports['./hooks/useStaffPermissions'] = { useStaffPermissions: () => ({ can: () => true }), DESTINATION_PERMISSIONS: new Proxy({}, { get: () => 'clinic' }) };
  imports['react/jsx-runtime'] = require('react/jsx-runtime');
  imports['./hooks/useSidebarDisclosureMotion'] = { useSidebarDisclosureMotion: () => ({ panelRef: { current: null }, prepare() {} }) };
  const { AdminSidebar } = load('features/admin/AdminSidebar.tsx', imports);
  const tree = AdminSidebar({ activePage: 'roster-dashboard', branch: 'q1', staffName: 'Admin', isAdmin: true, themeMode: 'light', isCollapsed: false });
  function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
  const panel = elements(tree).find((node) => node.props?.inert === true);
  assert.equal(panel.props['aria-hidden'], true);
  assert.equal(panel.props.style.height, 0);
  assert.equal(panel.props.style.overflow, 'hidden');
});
