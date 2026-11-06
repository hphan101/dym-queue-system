const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, globals) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/features/registration', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(globals), code)(exports, ...Object.values(globals));
  return exports;
}

test('PDF printing preserves desktop, mobile, blocked popup and iframe-failure fallbacks', () => {
  const calls = [];
  const navigator = { userAgent: 'Desktop', maxTouchPoints: 0 };
  const tab = { opener: {} };
  const window = { innerWidth: 1200, open(url, target) { calls.push(['open', url, target]); return tab; } };
  const { printPdf } = load('pdfBrowser.ts', { navigator, window });
  const frame = { contentWindow: { focus() { calls.push('focus'); }, print() { calls.push('print'); } } };
  const download = () => calls.push('download');
  printPdf('blob:pdf', frame, download);
  assert.deepEqual(calls.splice(0), ['focus', 'print']);
  navigator.userAgent = 'Android';
  printPdf('blob:pdf', frame, download);
  assert.deepEqual(calls.splice(0), [['open', 'blob:pdf', '_blank']]);
  assert.equal(tab.opener, null);
  navigator.userAgent = 'Desktop';
  frame.contentWindow.print = () => { throw new Error('Unavailable'); };
  printPdf('blob:pdf', frame, download);
  assert.deepEqual(calls.splice(0), ['focus', ['open', 'blob:pdf', '_blank']]);
  window.open = () => null;
  printPdf('blob:pdf', null, download);
  assert.deepEqual(calls, ['download']);
});

test('PDF download preserves its filename and removes the temporary link', () => {
  const calls = [];
  const link = { click() { calls.push('click'); } };
  const document = { createElement(tag) { assert.equal(tag, 'a'); return link; }, body: {
    appendChild(value) { assert.equal(value, link); calls.push('append'); },
    removeChild(value) { assert.equal(value, link); calls.push('remove'); },
  } };
  load('pdfBrowser.ts', { document }).downloadPdf('blob:pdf', 'Dong_Thuan_Nguyễn_An.pdf');
  assert.equal(link.href, 'blob:pdf');
  assert.equal(link.download, 'Dong_Thuan_Nguyễn_An.pdf');
  assert.deepEqual(calls, ['append', 'click', 'remove']);
});

test('print modal dismiss preserves scroll, Escape handling and the latest close callback', () => {
  let effect, closeRef;
  const listeners = new Map();
  const document = { body: { style: { overflow: 'auto' } } };
  const window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => {
    assert.equal(listeners.get(name), fn); listeners.delete(name);
  } };
  const react = { useRef: (value) => closeRef ??= { current: value }, useEffect: (fn) => { effect = fn; } };
  const { usePrintModalDismiss } = load('usePrintModalDismiss.ts', { require: () => react, document, window });
  const closed = [];
  usePrintModalDismiss(true, () => closed.push('old'));
  const cleanup = effect();
  assert.equal(document.body.style.overflow, 'hidden');
  usePrintModalDismiss(true, () => closed.push('latest'));
  listeners.get('keydown')({ key: 'Enter' });
  listeners.get('keydown')({ key: 'Escape' });
  assert.deepEqual(closed, ['latest']);
  cleanup();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(listeners.size, 0);
  usePrintModalDismiss(false, () => {});
  assert.equal(effect(), undefined);
  assert.equal(document.body.style.overflow, 'auto');
});
