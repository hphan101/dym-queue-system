const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name, imports) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/components', name), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, (key) => imports[key]);
  return exports;
}
const model = load('adminBreadcrumbs.ts', { react: { createContext: (value) => ({ value }) } });

test('every admin page has a specific group and current location without inventing parent links', () => {
  for (const page of ['dashboard', 'registrations', 'staff', 'roster-dashboard', 'roster-settlement', 'roster-insite', 'roster-onsite', 'roster-personnel']) {
    const items = model.getAdminBreadcrumbs(page);
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.label && !item.href));
  }
  assert.equal(model.getAdminBreadcrumbs('staff')[0].label, 'Hệ thống');
  assert.equal(model.getAdminBreadcrumbs('roster-insite')[1].label, 'Lịch tại Phòng khám');
});

test('breadcrumb exposes one current page, usable parent navigation, and hides empty trails', () => {
  let returned = false, followed;
  const { AdminBreadcrumb } = load('AdminBreadcrumb.tsx', {
    react: { useContext: () => [] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': { ChevronRight: 'svg' },
    './adminBreadcrumbs': model,
    '@/lib/navigation': { handleInternalLinkClick: (_, href) => { followed = href; } },
  });
  assert.equal(AdminBreadcrumb({}), null);
  const tree = AdminBreadcrumb({ items: [
    { label: 'Điều phối', href: '/?page=roster-dashboard' },
    { label: 'Đoàn khám Onsite', onSelect: () => { returned = true; } },
    { label: 'Công ty DYM · 14/11/2026', href: '/ignored' },
  ] });
  const entries = tree.props.children.props.children;
  assert.equal(tree.props['aria-label'], 'Đường dẫn điều hướng');
  entries[0].props.children[1].props.onClick({});
  assert.equal(followed, '/?page=roster-dashboard');
  entries[1].props.children[1].props.onClick();
  assert.equal(returned, true);
  assert.equal(entries[2].props.children[1].type, 'span');
  assert.equal(entries[2].props.children[1].props['aria-current'], 'page');
});
