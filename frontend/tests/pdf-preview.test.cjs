const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/registration', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, (name) => name in mocks ? mocks[name] : require(name));
  return exports;
}

test('mobile previews retain the selected PDF page and never alter the full document', async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([500, 600]);
  source.addPage([700, 800]);
  const original = await source.save();
  const { createPdfPagePreview } = load('pdfPagePreview.ts');
  for (let index = 0; index < source.getPageCount(); index++) {
    const blob = await createPdfPagePreview(source, index);
    const preview = await PDFDocument.load(await blob.arrayBuffer());
    assert.equal(blob.type, 'application/pdf');
    assert.equal(preview.getPageCount(), 1);
    assert.deepEqual(preview.getPage(0).getSize(), source.getPage(index).getSize());
  }
  assert.equal(source.getPageCount(), 3);
  assert.deepEqual(await source.save(), original);
  await assert.rejects(createPdfPagePreview(source, -1));
  await assert.rejects(createPdfPagePreview(source, 3));
  await assert.rejects(createPdfPagePreview(source, 0.5));
});

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}

test('mobile navigation reaches first, middle and last pages with correct boundaries; desktop uses the complete PDF', () => {
  const states = [true, { getPageCount: () => 3 }, 0, 'blob:single', false, 0];
  let slot = 0;
  const { PdfPreview } = load('PdfPreview.tsx', {
    react: { useState() { const index = slot++; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useEffect() {} },
    'react/jsx-runtime': require('react/jsx-runtime'),
    './pdfBrowser': { isMobilePdfViewer: () => true },
    './pdfPagePreview': {},
  });
  let ready = 0;
  const props = { url: 'blob:complete', title: 'Consent', iframeRef: { current: null }, onReady() { ready++; } };
  const render = () => { slot = 0; return nodes(PdfPreview(props)); };
  const buttons = () => render().filter((node) => node.type === 'button');
  assert.equal(buttons()[0].props.disabled, true);
  buttons()[1].props.onClick();
  assert.equal(states[2], 1);
  assert.equal(buttons()[0].props.disabled, false);
  buttons()[1].props.onClick();
  assert.equal(states[2], 2);
  assert.equal(buttons()[1].props.disabled, true);
  const frame = render().find((node) => node.type === 'iframe');
  assert.equal(frame.props.src, 'blob:single#toolbar=0&navpanes=0&view=FitH');
  assert.match(frame.props.title, /trang 3/);
  frame.props.onLoad();
  assert.equal(ready, 1);
  buttons()[0].props.onClick();
  assert.equal(states[2], 1);
  states[0] = false;
  const desktop = render();
  assert.equal(desktop.some((node) => node.type === 'nav'), false);
  assert.equal(desktop.find((node) => node.type === 'iframe').props.src, 'blob:complete#toolbar=0&navpanes=0&view=FitH');
});
