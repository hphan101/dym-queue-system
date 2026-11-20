const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const exportsForTable = {};
const source = fs.readFileSync(path.resolve(__dirname, '../src/features/admin/registrations/RegistrationsTable.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const generic = new Proxy({}, { get: () => () => ({ label: '', className: '' }) });
const anchorRef = { current: null };
new Function('exports', 'require', code)(exportsForTable, name => {
  if (name === 'react') return { useRef: () => anchorRef };
  if (name === 'react/jsx-runtime') return require(name);
  if (name === '@/components/ui/checkbox') return { Checkbox: 'checkbox' };
  if (name === './usePrintStatus') return { usePrintStatus: () => ({ getStatus: () => ({ consent: false, tt25: false }) }) };
  return generic;
});

test('Shift click selects the visible range in either direction and falls back when the anchor is off-page', () => {
  const calls = [];
  const rows = ['a', 'b', 'c', 'd'].map(id => ({ id, full_name: id }));
  const render = (checkedIds, pageRows = rows) => nodes(exportsForTable.RegistrationsTable({
    rows: pageRows, checkedIds: new Set(checkedIds), onToggleChecked: (...args) => calls.push(args),
  })).filter(node => node.type === 'checkbox');
  let prevented = false;
  const event = { shiftKey: true, preventDefault() { prevented = true; } };

  render([])[1].props.onCheckedChange(true);
  render(['a'])[4].props.onClick(event);
  assert.equal(prevented, true);
  assert.deepEqual(calls.pop(), [['a', 'b', 'c', 'd'], true]);

  render([])[4].props.onCheckedChange(true);
  render(['d'])[2].props.onClick(event);
  assert.deepEqual(calls.pop(), [['b', 'c', 'd'], true]);

  prevented = false;
  render(['d'], rows.slice(0, 2))[2].props.onClick(event);
  assert.equal(prevented, false);
});

const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
test('registration checkboxes retain partial, all and empty page selection', () => {
  const calls = [];
  const rows = [{ id: 'a', full_name: 'Nguyễn An' }, { id: 'b', full_name: 'Trần Bình' }];
  const render = (checkedIds, pageRows = rows) => nodes(exportsForTable.RegistrationsTable({ rows: pageRows, checkedIds: new Set(checkedIds), onToggleChecked: (...args) => calls.push(args) })).filter(n => n.type === 'checkbox');
  const partial = render(['a']);
  assert.equal(partial[0].props.checked, 'indeterminate');
  assert.equal(partial[1].props.checked, true);
  assert.equal(partial[2].props.checked, false);
  partial[0].props.onCheckedChange(true);
  assert.deepEqual(calls.pop(), [['a', 'b'], true]);
  partial[1].props.onCheckedChange(false);
  assert.deepEqual(calls.pop(), [['a'], false]);
  assert.equal(render(['a', 'b'])[0].props.checked, true);
  assert.equal(render([])[0].props.checked, false);
  assert.equal(render([], [])[0].props.disabled, true);
});
