const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('shared admin layout preserves branch/role, sidebar controls and workspace/modal placement', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/admin/shell/AdminLayout.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = {};
  let mode, collapsed, signedOut = 0;
  const mocks = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@astryxdesign/core/theme': { Theme: 'Theme' },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './AdminSidebar': { AdminSidebar: 'Sidebar' },
    '../shared/adminIdentity': { signOutAdminSession: () => { signedOut++; } },
    './useAdminTheme': { useAdminTheme: () => ({ themeMode: 'light', setThemeMode: callback => { mode = callback('light'); } }) },
    './useSidebarResponsive': { useSidebarResponsive: () => ({ isSidebarCollapsed: false, setIsSidebarCollapsed: value => { collapsed = value; } }) },
    './adminBreadcrumbs': { AdminBreadcrumbContext: { Provider: 'BreadcrumbProvider' }, getAdminBreadcrumbs: () => [{ label: 'Danh sách tiếp nhận' }] },
    './theme': { dymAdminTheme: 'theme' },
    '../shared/useStaffPermissions': { PermissionModuleContext: { Provider: 'PermissionProvider' }, DESTINATION_PERMISSIONS: { registrations: 'registrations' } },
  };
  new Function('exports', 'require', code)(result, name => mocks[name] ?? {});
  const children = { type: 'content' }, overlays = { type: 'modal' };
  const tree = result.AdminLayout({ activePage: 'registrations', branch: 'q7', date: '2026-11-06', staffName: 'Lễ tân', isAdmin: false, staffRole: 'receptionist', className: 'extra', children, overlays });
  assert.equal(tree.props.value, 'registrations');
  const shell = tree.props.children.props.children;
  const [sidebar, breadcrumbProvider, modal] = shell.props.children;
  const workspace = breadcrumbProvider.props.children;
  assert.equal(breadcrumbProvider.props.value[0].label, 'Danh sách tiếp nhận');
  assert.equal(shell.props.className, 'dym-admin-shell extra');
  assert.equal(sidebar.props.branch, 'q7');
  assert.equal(sidebar.props.staffRole, 'receptionist');
  assert.equal(sidebar.props.isAdmin, false);
  assert.equal(workspace.props.className, 'dym-admin-workspace');
  assert.equal(workspace.props.children, children);
  assert.equal(modal, overlays);
  sidebar.props.onThemeToggle();
  sidebar.props.onCollapsedChange(true);
  sidebar.props.onLogout();
  assert.equal(mode, 'dark');
  assert.equal(collapsed, true);
  assert.equal(signedOut, 1);
});
