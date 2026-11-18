const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToString } = require('react-dom/server');

function load(file, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, (name) => imports[name] ?? require(name));
  return exports;
}

test('App supplies the tooltip context to routed content outside the sidebar', () => {
  const tooltip = load('components/ui/tooltip.tsx', {
    '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  });
  const Probe = () => React.createElement(tooltip.Tooltip, null,
    React.createElement(tooltip.TooltipTrigger, null, 'Kiểm tra Tooltip'));
  const PassThrough = ({ children }) => children;
  const { default: App } = load('app/App.tsx', {
    react: { ...React, lazy: () => Probe },
    '@tanstack/react-query': { QueryClientProvider: PassThrough },
    '../components/ErrorBoundary': { ErrorBoundary: PassThrough },
    '../components/ui/tooltip': tooltip,
    '../features/auth/LoginPage': { default: PassThrough },
    '../lib/navigation': { APP_NAVIGATION_EVENT: 'dym:navigate' },
    '../lib/queryClient': { queryClient: {} },
    './routes': load('app/routes.ts'),
  });
  const previousWindow = global.window;
  global.window = { location: { pathname: '/', search: '?page=roster-insite' } };
  try {
    const html = renderToString(React.createElement(App));
    assert.ok(html.includes('Kiểm tra Tooltip'), html);
    assert.ok(!html.includes('must be used within'), html);
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});
