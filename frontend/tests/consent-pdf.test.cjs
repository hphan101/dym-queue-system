const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const frontend = path.resolve(__dirname, '..');
const layout = require('../src/features/registration/consentTemplateFields.json');

function loadService() {
  const fetched = [];
  const code = ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/features/registration/consentPdfService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const date = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/lib/date.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(date);
  const drawing = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/features/registration/pdfDrawing.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(drawing, require);
  const dependencies = {
    'pdf-lib': require('pdf-lib'), '@pdf-lib/fontkit': fontkit,
    './consentTemplateFields.json': layout,
    '../../lib/date': { ...date, getTodayInVietnam: () => '2026-11-01' },
    './pdfDrawing': drawing,
    './pdfPrintSession': require('./helpers/pdf-print-session.cjs'),
  };
  const execute = new Function('exports', 'require', 'fetch', 'Blob', 'URL', code);
  execute(exports, (name) => dependencies[name], async (url) => {
      const file = path.join(frontend, 'public', url.split('?')[0]);
      fetched.push(url);
      const bytes = fs.readFileSync(file);
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }, Blob, URL);
  return { ...exports, fetched };
}

const service = loadService();
const customer = {
  language: 'vi', fullName: 'Nguyễn Thị Minh Anh', gender: 'Nữ', birthDate: '1995-03-21',
  cccd: '001195012345', phoneNumber: '0901234567', email: 'khach@example.test',
  workplace: 'Công ty TNHH Kiểm Tra Biểu Mẫu', checkupDate: '2026-11-01',
  queueNumber: 'Q1-152',
};

test('consent form follows the selected language, including Vietnamese passport holders', () => {
  assert.equal(service.getConsentFormLanguage({ language: 'vi', cccd: 'B1234567' }), 'vi');
  assert.equal(service.getConsentFormLanguage({ language: 'en', cccd: '001195012345' }), 'bilingual');
  assert.equal(service.getConsentFormLanguage({}), 'vi');
});

test('consent templates include an even number of pages for each separate form', async () => {
  for (const [language, pages] of [['vi', 4], ['bilingual', 4]]) {
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(frontend, 'public/templates', layout[language].template)));
    assert.equal(pdf.getPageCount(), pages);
    assert.equal(service.getConsentPageIndices(language, 'consent').length, pages / 2);
    assert.equal(service.getConsentPageIndices(language, 'refusal').length, pages / 2);
  }
});

test('consent generation uses original PDFs, with correct page selection', async () => {
  for (const language of ['vi', 'en']) {
    const complete = await service.generateConsentPdf({ ...customer, language });
    const selected = await service.generateConsentPdf({ ...customer, language }, 'refusal');
    const consent = await service.generateConsentPdf({ ...customer, language }, 'consent');
    try {
      assert.equal((await PDFDocument.load(await complete.blob.arrayBuffer())).getPageCount(), 4);
      assert.equal((await PDFDocument.load(await selected.blob.arrayBuffer())).getPageCount(), 2);
      assert.equal((await PDFDocument.load(await consent.blob.arrayBuffer())).getPageCount(), 2);
      if (language === 'vi') {
        const all = await PDFDocument.load(await complete.blob.arrayBuffer());
        for (const index of [1, 3]) assert.equal(all.getPage(index).node.Contents(), undefined, 'blank template pages remain unfilled');
        for (const result of [consent, selected]) {
          const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
          assert.equal(pdf.getPage(1).node.Contents(), undefined, 'each separate form ends with a blank page');
        }
      }
      assert.equal(complete.blob.type, 'application/pdf');
    } finally { URL.revokeObjectURL(complete.url); URL.revokeObjectURL(selected.url); URL.revokeObjectURL(consent.url); }
  }
  assert.equal(service.fetched.filter((url) => url.startsWith('/fonts/arial.ttf?')).length, 1);
  assert.equal(service.fetched.some((url) => url.startsWith('/templates/dong-thuan-kham.pdf')), false);
});

module.exports = { loadService, customer };
