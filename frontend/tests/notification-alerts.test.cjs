const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const src = path.resolve(__dirname, '../src');
function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(src, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, key => imports[key] ?? require(key));
  return exports;
}
const utils = { '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') } };
const alert = load('components/ui/alert.tsx', utils);
const button = load('components/ui/button.tsx', utils);
const imports = { '@/components/ui/alert': alert, '@/components/ui/button': button };

test('new-customer notification uses shadcn Alert, safely renders patient text and preserves dismiss', () => {
  const { CustomerNoticeModal } = load('features/admin/shared/CustomerNoticeModal.tsx', imports);
  assert.equal(CustomerNoticeModal({ notification: null, onClose() {} }), null);
  let closed = 0;
  const tree = CustomerNoticeModal({ notification: { id: 'demo', queueNumber: '001', fullName: '<script>Test</script>' }, onClose: () => closed++ });
  const children = React.Children.toArray(tree.props.children);
  assert.equal(children[0].type, alert.Alert);
  assert.equal(children[1].type, button.Button);
  children[1].props.onClick();
  assert.equal(closed, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Khách mới đăng ký/);
  assert.match(html, /Số 001/);
  assert.match(html, /&lt;script&gt;Test&lt;\/script&gt;/);
  assert.doesNotMatch(html, /role="dialog"|autofocus/);
});

test('connection warnings hide while connected and distinguish offline from disconnected', () => {
  const { RealtimeConnectionAlert } = load('features/admin/shared/RealtimeConnectionAlert.tsx', imports);
  for (const state of ['connecting', 'connected']) assert.equal(RealtimeConnectionAlert({ state }), null);
  for (const [state, title] of [['offline', 'Thiết bị đang mất Internet'], ['disconnected', 'Mất kết nối Supabase Realtime']]) {
    const tree = RealtimeConnectionAlert({ state });
    assert.equal(tree.type, alert.Alert);
    assert.equal(tree.props.variant, 'warning');
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(title));
    assert.match(html, /role="status"/);
  }
});

test('notification variants retain content, and no feature uses native alerts or raw alert containers', () => {
  for (const variant of ['default', 'success', 'warning', 'destructive']) {
    const html = renderToStaticMarkup(React.createElement(alert.Alert, { variant }, React.createElement(alert.AlertDescription, null, 'Nội dung thông báo')));
    assert.ok(html.includes(`data-variant="${variant}"`));
    assert.ok(html.includes('Nội dung thông báo'));
  }
  for (const file of walk(path.join(src, 'features'))) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node)) assert.ok(!['alert', 'window.alert'].includes(node.expression.getText(ast)), file);
      if (ts.isJsxOpeningElement(node) && ['div', 'p', 'span'].includes(node.tagName.getText(ast))) {
        assert.ok(!node.attributes.properties.some(attr => attr.name?.text === 'role' && attr.initializer?.text === 'alert'), file);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (/\.tsx?$/.test(file)) yield file;
  }
}
