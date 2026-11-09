const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument, PDFPage } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const frontend = path.resolve(__dirname, '..');
const layout = require('../src/features/registration/tt25TemplateFields.json');
function execute(file, dependencies, fetchAsset) {
  const code = ts.transpileModule(fs.readFileSync(path.join(frontend, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', 'Blob', 'URL', code)(exports, (name) => {
    if (!(name in dependencies)) throw new Error(`Missing dependency: ${name}`);
    return dependencies[name];
  }, fetchAsset, Blob, URL);
  return exports;
}
function loadService() {
  const date = { ...execute('src/lib/date.ts', {}), getTodayInVietnam: () => '2026-11-02' };
  const drawing = execute('src/features/registration/pdfDrawing.ts', { 'pdf-lib': require('pdf-lib') });
  const types = execute('src/features/registration/tt25Types.ts', {});
  return execute('src/features/registration/tt25HcmPdfService.ts', {
    'pdf-lib': require('pdf-lib'), '@pdf-lib/fontkit': fontkit, '../../lib/date': date,
    './pdfDrawing': drawing, './tt25Types': types, './tt25TemplateFields.json': layout,
    './pdfPrintSession': require('./helpers/pdf-print-session.cjs'),
    './tt25PdfService': { generateTT25OriginalPdf: async () => ({ legacy: true }) },
  }, async (url) => {
    const bytes = fs.readFileSync(path.join(frontend, 'public', url.split('?')[0]));
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });
}
const customer = {
  branch: 'q1', language: 'vi', fullName: 'Nguyễn Thị Minh Anh', gender: 'Nữ',
  birthDate: '1995-03-21', cccd: '001195012345', ethnicity: 'Kinh', bloodGroup: 'O (Rh+)',
  insuranceNumber: 'DN1234567890123', addressDetail: '39 Lê Duẩn', ward: 'Bến Nghé', province: 'Hồ Chí Minh',
  occupation: 'Nhân viên văn phòng', workplace: 'Công ty TNHH Kiểm Tra Biểu Mẫu', workplaceWard: 'Quận 1, Hồ Chí Minh',
  phoneNumber: '0901234567', email: 'khach@example.test', checkupReason: 'Khám sức khỏe định kì doanh nghiệp',
  checkupDate: '2026-11-02', targetPayment: { targetGroup: '15', paymentSource: 'employer' },
  medicalHistory: {
    familyHistory: { hasDisease: true, diseaseDetails: 'Đái tháo đường' },
    personalHistory: Object.fromEntries(Array.from({ length: 22 }, (_, i) => [i + 1, i % 2 === 1])),
    personalOtherDetails: 'Dị ứng thời tiết',
    currentTreatment: { isTreating: true, medications: 'Vitamin D, mỗi ngày một viên' },
    pregnancyHistory: { hasHistory: true, details: 'Sinh thường năm 2020' }, commitmentAgreed: true,
  },
};
if (require.main === module) {
test('TT25 selects original HCM templates by language and Work Permit, preserving Hanoi', () => {
  const service = loadService();
  assert.equal(service.getTT25TemplateInfo(customer).key, 'vnm');
  assert.equal(service.getTT25TemplateInfo({ ...customer, language: 'en' }).key, 'bilingual');
  for (const language of ['vi', 'en']) assert.equal(service.getTT25TemplateInfo({ ...customer, language, checkupReason: 'Khám sức khỏe bổ sung hồ sơ xin Work Permit' }).key, 'wp');
  assert.equal(service.getTT25TemplateInfo({ ...customer, checkupReason: 'Khám sức khỏe khác' }).key, 'vnm');
  assert.equal(service.getTT25TemplateInfo({ ...customer, branch: 'hn' }).key, 'legacy');
  for (const checkupReason of ['Khám sức khỏe định kì doanh nghiệp', 'Khám sức khỏe định kỳ theo công ty', '']) {
    assert.equal(service.getTT25PrintCopies({ checkupReason }), 1);
  }
  for (const checkupReason of ['Work Permit', 'Khám sức khỏe khác', 'Khám sức khỏe cá nhân tự nguyện', 'Khám sức khỏe đi học/đi làm']) {
    assert.equal(service.getTT25PrintCopies({ checkupReason }), 2);
  }
});
test('TT25 fills original 9/13/12-page PDFs and all 22 history answers without changing source assets', async () => {
  const service = loadService();
  const drawn = [];
  const segments = [];
  const drawText = PDFPage.prototype.drawText;
  const drawLine = PDFPage.prototype.drawLine;
  let lines = 0;
  PDFPage.prototype.drawText = function (text, options) { drawn.push({ text, options }); return drawText.call(this, text, options); };
  PDFPage.prototype.drawLine = function (options) { lines++; segments.push(options); return drawLine.call(this, options); };
  try {
    for (const [language, reason, pages] of [['vi', customer.checkupReason, 9], ['en', customer.checkupReason, 13], ['vi', 'Work Permit', 24]]) {
      drawn.length = 0; segments.length = 0; lines = 0;
      const result = await service.generateTT25OriginalPdf({ ...customer, language, checkupReason: reason });
      try {
        assert.equal((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount(), pages);
        assert.equal(lines, 52);
        assert.deepEqual(segments[0].end, segments[1].start, 'tick strokes must join instead of crossing');
        assert.ok(segments[0].start.y > segments[0].end.y && segments[1].end.y > segments[1].start.y);
        for (const text of ['NGUYỄN THỊ MINH ANH', '0901234567', 'khach@example.test', 'Dị ứng thời tiết', 'Sinh thường năm 2020']) assert.ok(drawn.some((item) => item.text === text), text);
        assert.ok(drawn.some((item) => item.text === '001195012345/02112026/GKSK-DYM'));
      } finally { URL.revokeObjectURL(result.url); }
    }
    lines = 0;
    const blank = await service.generateTT25OriginalPdf({ ...customer, medicalHistory: undefined });
    URL.revokeObjectURL(blank.url);
    assert.equal(lines, 2, 'missing medical history must not be marked No');
    assert.equal((await service.generateTT25OriginalPdf({ ...customer, branch: 'hn' })).legacy, true);
  } finally { PDFPage.prototype.drawText = drawText; PDFPage.prototype.drawLine = drawLine; }
});
test('mixed TT25 bulk printing pads each original template correctly for duplex', async () => {
  const service = loadService();
  const bulk = execute('src/features/registration/bulkPrintPdf.ts', {
    'pdf-lib': require('pdf-lib'), './tt25HcmPdfService': service,
    './pdfPrintSession': require('./helpers/pdf-print-session.cjs'),
    './consentPdfService': { generateConsentPdf: () => { throw new Error('Consent is not selected'); } },
  });
  const result = await bulk.generateBulkPrintPdf([
    customer, { ...customer, language: 'en' }, { ...customer, checkupReason: 'Work Permit' },
  ], 'tt25', true);
  try {
    const pdf = await PDFDocument.load(await (await fetch(result)).arrayBuffer());
    assert.equal(pdf.getPageCount(), 48, '9+blank, 13+blank, two WP copies of 12 pages');
  } finally { URL.revokeObjectURL(result); }
});
}
module.exports = { loadService, customer };
