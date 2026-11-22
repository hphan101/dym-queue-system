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
  if (name === '../../registration/tt25Types') return {
    getTT25PrintCopies: () => 1,
    PREGNANCY_STATUS_LABELS: { pregnant: { vi: 'Đang mang thai' } },
  };
  return generic;
});

const isCheckbox = node => node.type === 'checkbox' || (node.type === 'input' && node.props.type === 'checkbox');
const changeRowCheck = (node, checked, shiftKey = false) => node.props.onChange({ currentTarget: { checked }, nativeEvent: { shiftKey } });

test('Shift click selects the visible range in either direction and falls back when the anchor is filtered out', () => {
  const calls = [];
  const rows = ['a', 'b', 'c', 'd'].map(id => ({ id, full_name: id }));
  const render = (checkedIds, pageRows = rows) => nodes(exportsForTable.RegistrationsTable({
    rows: pageRows, checkedIds: new Set(checkedIds), onToggleChecked: (...args) => calls.push(args),
  })).filter(isCheckbox);

  changeRowCheck(render([])[1], true);
  changeRowCheck(render(['a'])[4], true, true);
  assert.deepEqual(calls.pop(), [['a', 'b', 'c', 'd'], true]);

  changeRowCheck(render([])[4], true);
  changeRowCheck(render(['d'])[2], true, true);
  assert.deepEqual(calls.pop(), [['b', 'c', 'd'], true]);

  changeRowCheck(render(['d'], rows.slice(0, 2))[2], true, true);
  assert.deepEqual(calls.pop(), [['b'], true]);
});

const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
test('only a female registration marked pregnant shows a pregnancy highlight, including when selected', () => {
  const rows = [
    { id: 'pregnant', gender: 'Nữ', tt25_data: { pregnancyStatus: 'pregnant' } },
    { id: 'suspected', gender: 'Nữ', tt25_data: { pregnancyStatus: 'suspected' } },
    { id: 'not-pregnant', gender: 'Nữ', tt25_data: { pregnancyStatus: 'not_pregnant' } },
    { id: 'unknown', gender: 'Nữ' },
    { id: 'male', gender: 'Nam', tt25_data: { pregnancyStatus: 'pregnant' } },
  ];
  const tableRows = nodes(exportsForTable.RegistrationsTable({
    rows, checkedIds: new Set(['pregnant']), onToggleChecked: () => {},
  })).filter(node => node.type === 'tr').slice(1);

  assert.deepEqual(tableRows.map(row => row.props['data-pregnant']), [true, undefined, undefined, undefined, undefined]);
  assert.equal(tableRows[0].props['data-selected'], true);
  assert.ok(nodes(tableRows[0]).some(node => node.props?.children === 'Nữ · Đang mang thai'));
});

test('registration checkboxes retain partial, all and empty selection', () => {
  const calls = [];
  const rows = [{ id: 'a', full_name: 'Nguyễn An' }, { id: 'b', full_name: 'Trần Bình' }];
  const render = (checkedIds, pageRows = rows) => nodes(exportsForTable.RegistrationsTable({ rows: pageRows, checkedIds: new Set(checkedIds), onToggleChecked: (...args) => calls.push(args) })).filter(isCheckbox);
  const partial = render(['a']);
  assert.equal(partial[0].props.checked, 'indeterminate');
  assert.equal(partial[1].props.checked, true);
  assert.equal(partial[2].props.checked, false);
  partial[0].props.onCheckedChange(true);
  assert.deepEqual(calls.pop(), [['a', 'b'], true]);
  changeRowCheck(partial[1], false);
  assert.deepEqual(calls.pop(), [['a'], false]);
  assert.equal(render(['a', 'b'])[0].props.checked, true);
  assert.equal(render([])[0].props.checked, false);
  assert.equal(render([], [])[0].props.disabled, true);
});
