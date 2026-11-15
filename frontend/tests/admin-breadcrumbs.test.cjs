const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name, imports) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/shell', name), 'utf8');
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
  assert.equal(model.getAdminBreadcrumbs('staff')[1].label, 'Quản lý tài khoản');
  assert.equal(model.getAdminBreadcrumbs('roster-personnel')[1].label, 'Nhân sự');
  assert.equal(model.getAdminBreadcrumbs('roster-insite')[1].label, 'Lịch tại Phòng khám');
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const breadcrumbUi = load('../../../components/ui/breadcrumb.tsx', {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@radix-ui/react-slot': require('@radix-ui/react-slot'),
  'lucide-react': require('lucide-react'),
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
});
function makeBreadcrumb(defaults = [], follow = () => {}) {
  return load('AdminBreadcrumb.tsx', {
    react: { ...React, useContext: () => defaults },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/components/ui/breadcrumb': breadcrumbUi,
    './adminBreadcrumbs': model,
    '@/lib/navigation': { handleInternalLinkClick: follow },
  }).AdminBreadcrumb;
}
function descendants(node) {
  return React.Children.toArray(node?.props?.children).flatMap((child) =>
    React.isValidElement(child) ? [child, ...descendants(child)] : []);
}

test('shadcn breadcrumb exposes one current page and preserves both parent navigation types', () => {
  let returned = false, followed;
  const AdminBreadcrumb = makeBreadcrumb([], (_, href) => { followed = href; });
  assert.equal(AdminBreadcrumb({}), null);
  const tree = AdminBreadcrumb({ items: [
    { label: 'Điều phối', href: '/?page=roster-dashboard' },
    { label: 'Đoàn khám Onsite', onSelect: () => { returned = true; } },
    { label: 'Công ty DYM · 14/11/2026', href: '/ignored' },
  ] });
  assert.equal(tree.type, breadcrumbUi.Breadcrumb);
  const nodes = descendants(tree);
  nodes.find((node) => node.type === 'a').props.onClick({});
  assert.equal(followed, '/?page=roster-dashboard');
  nodes.find((node) => node.type === 'button').props.onClick();
  assert.equal(returned, true);
  assert.equal(nodes.filter((node) => node.type === breadcrumbUi.BreadcrumbPage).length, 1);
  assert.equal(nodes.filter((node) => node.type === breadcrumbUi.BreadcrumbSeparator).length, 2);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-label="Đường dẫn điều hướng"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.equal((html.match(/role="presentation" aria-hidden="true"/g) || []).length, 2);
  assert.ok(!html.includes('href="/ignored"'));
  assert.doesNotMatch(html, /<li[^>]*>\s*<li/);
});

test('all admin trails use shadcn; explicit details override defaults and long labels remain intact', () => {
  for (const page of ['dashboard', 'registrations', 'staff', 'roster-dashboard', 'roster-settlement', 'roster-insite', 'roster-onsite', 'roster-personnel']) {
    const AdminBreadcrumb = makeBreadcrumb(model.getAdminBreadcrumbs(page));
    const html = renderToStaticMarkup(AdminBreadcrumb({}));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, /<nav/);
    assert.equal(AdminBreadcrumb({ items: [] }), null);
  }
  const AdminBreadcrumb = makeBreadcrumb(model.getAdminBreadcrumbs('staff'));
  const label = 'Chi tiết đoàn khám ' + 'rất dài '.repeat(40);
  const tree = AdminBreadcrumb({ items: [{ label }] });
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Quản lý tài khoản/);
  assert.equal(descendants(tree).filter((node) => node.type === breadcrumbUi.BreadcrumbSeparator).length, 0);
});
