const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/components/search-field.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exported = {};
new Function('exports', 'require', code)(exported, name => ({
  react: { ...React, useRef: () => ({ current: null }), useCallback: callback => callback },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': { Search: 'SearchIcon', X: 'ClearIcon' },
  '@/components/ui/input': { Input: 'input' },
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  './search-field.css': {},
})[name]);
const render = (props, ref = null) => exported.SearchField.render(props, ref);

test('shared search preserves input events and refs; clear restores focus for continued typing', () => {
  let cleared = false;
  let changed;
  let focused = false;
  const ref = { current: null };
  const tree = render({ value: 'An', onClear: () => { cleared = true; }, onChange: event => { changed = event.target.value; }, 'aria-label': 'Tìm nhân sự' }, ref);
  const children = React.Children.toArray(tree.props.children);
  const input = children.find(child => child.type === 'input');
  const element = { focus: () => { focused = true; } };
  input.props.ref(element);
  assert.equal(ref.current, element);
  assert.equal(input.props.type, 'search');
  assert.equal(input.props['aria-label'], 'Tìm nhân sự');
  input.props.onChange({ target: { value: 'Bình' } });
  assert.equal(changed, 'Bình');
  children.find(child => child.type === 'button').props.onClick();
  assert.equal(cleared, true);
  assert.equal(focused, true);
  input.props.ref(null);
  assert.equal(ref.current, null);
});

test('shared search displays shortcut only when empty and propagates disabled state', () => {
  const props = { value: '', onClear() {}, shortcut: true };
  const empty = React.Children.toArray(render(props).props.children);
  assert.ok(empty.some(child => child.type === 'kbd'));
  assert.ok(!empty.some(child => child.type === 'button'));
  const filled = React.Children.toArray(render({ ...props, value: 'An', disabled: true }).props.children);
  assert.ok(!filled.some(child => child.type === 'kbd'));
  assert.equal(filled.find(child => child.type === 'input').props.disabled, true);
  assert.equal(filled.find(child => child.type === 'button').props.disabled, true);
});
