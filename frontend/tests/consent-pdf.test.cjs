const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument, PDFPage } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const frontend = path.resolve(__dirname, '..');
const layout = require('../src/features/registration/printing/consentTemplateFields.json');
const consentVersion = 'DYM.PRO.09.FOR.02.03-2026-11-19';

function loadService(onMark) {
  const fetched = [];
  const code = ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/features/registration/printing/consentPdfService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const date = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/lib/date.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(date);
  const drawing = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/features/registration/printing/pdfDrawing.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(drawing, require);
  const dependencies = {
    'pdf-lib': require('pdf-lib'), '@pdf-lib/fontkit': fontkit,
    './consentTemplateFields.json': layout,
    '../tt25Types': { CONSENT_FORM_VERSION: consentVersion },
    '../../../lib/date': { ...date, getTodayInVietnam: () => '2026-11-01' },
    './pdfDrawing': {
      ...drawing,
      drawPdfCheck(page, x, y) {
        onMark?.({ x, y });
        drawing.drawPdfCheck(page, x, y);
      },
    },
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
  assert.equal(service.getConsentFormLanguage({ language: 'ja' }), 'bilingual');
  assert.equal(service.getConsentFormLanguage({}), 'vi');
});

test('consent templates retain original content pages without blank separators', async () => {
  for (const [language, pages] of [['vi', 2], ['bilingual', 4]]) {
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(frontend, 'public/templates', layout[language].template)));
    assert.equal(pdf.getPageCount(), pages);
    for (const page of pdf.getPages()) assert.ok(page.node.Contents(), 'every page contains form content');
    assert.equal(service.getConsentPageIndices(language, 'consent').length, pages / 2);
    assert.equal(service.getConsentPageIndices(language, 'refusal').length, pages / 2);
  }
});

test('consent generation uses original PDFs, with correct page selection', async () => {
  const numbers = [];
  const drawText = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (text, options) {
    if (text.startsWith('Trang ')) numbers.push([this.doc.getPages().indexOf(this), text]);
    return drawText.call(this, text, options);
  };
  try {
    for (const language of ['vi', 'en']) {
      const pagesPerForm = language === 'vi' ? 1 : 2;
      for (const [option, count, offset] of [['all', 2 * pagesPerForm, 0], ['consent', pagesPerForm, 0], ['refusal', pagesPerForm, pagesPerForm]]) {
        const result = await service.generateConsentPdf({ ...customer, language }, option);
        try {
          assert.equal(result.blob.type, 'application/pdf');
          const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
          assert.equal(pdf.getPageCount(), count);
          for (const page of pdf.getPages()) assert.ok(page.node.Contents(), 'no blank page in printed consent/refusal');
          assert.deepEqual(numbers.splice(0), Array.from({ length: count }, (_, index) => [offset + index, `Trang ${index + 1}/${count}`]));
        } finally { URL.revokeObjectURL(result.url); }
      }
    }
  } finally { PDFPage.prototype.drawText = drawText; }
  assert.equal(service.fetched.filter((url) => url.startsWith('/fonts/arial.ttf?')).length, 1);
  assert.equal(service.fetched.some((url) => url.startsWith('/templates/dong-thuan-kham.pdf')), false);
});

module.exports = { loadService, customer };

test('consent PDF marks gender, pregnancy status and the applicable consent choices', async () => {
  const marks = [];
  const print = loadService(mark => marks.push(mark));
  const coordinates = ({ x, y }) => ({ x, y });
  for (const language of ['vi', 'en']) {
    const form = layout[print.getConsentFormLanguage({ language })];
    const choices = form.consentMarks;
    for (const [pregnancyStatus, examination] of [['not_pregnant', true], ['suspected', false], ['pregnant', true]]) {
      const result = await print.generateConsentPdf({ ...customer, language, pregnancyStatus, consentFormVersion: consentVersion, consentAgreed: examination, advertisingConsentAgreed: !examination });
      URL.revokeObjectURL(result.url);
      assert.deepEqual(marks.splice(0), [
        form.genderMarks['Nữ'], form.pregnancyMarks[pregnancyStatus],
        choices.examination[examination ? 'agree' : 'decline'], choices.advertising[examination ? 'decline' : 'agree'],
      ].map(coordinates));
    }
    const old = await print.generateConsentPdf({ ...customer, language, consentAgreed: true });
    URL.revokeObjectURL(old.url);
    assert.deepEqual(marks.splice(0), [coordinates(form.genderMarks['Nữ'])]);
    const male = await print.generateConsentPdf({ ...customer, language, gender: 'Nam', pregnancyStatus: 'suspected', consentAgreed: true, advertisingConsentAgreed: true, consentFormVersion: 'DYM.PRO.09.FOR.02.03-2026-11-18' });
    URL.revokeObjectURL(male.url);
    assert.deepEqual(marks.splice(0), [coordinates(form.genderMarks.Nam), coordinates(choices.examination.agree)]);
  }
});
