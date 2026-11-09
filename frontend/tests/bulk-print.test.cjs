const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, PDFPage } = require('pdf-lib');
const { loadPdfFixtures } = require('./helpers/pdf-fixtures.cjs');
const { customer } = require('./tt25-pdf.test.cjs');

test('bulk printing shares fonts, saves once and retains mixed-template order and duplex blanks', async () => {
  const bulk = loadPdfFixtures();
  const originalEmbed = PDFDocument.prototype.embedFont, originalSave = PDFDocument.prototype.save, originalDraw = PDFPage.prototype.drawText;
  let fonts = 0, saves = 0;
  const names = [], progress = [];
  PDFDocument.prototype.embedFont = function (...args) { fonts++; return originalEmbed.apply(this, args); };
  PDFDocument.prototype.save = function (...args) { saves++; return originalSave.apply(this, args); };
  PDFPage.prototype.drawText = function (text, options) {
    if (text.startsWith('PATIENT ')) names.push([text, this.doc.getPages().indexOf(this)]);
    return originalDraw.call(this, text, options);
  };
  let url;
  try {
    url = await bulk.generateBulkPrintPdf([
      { ...customer, fullName: 'Patient A' },
      { ...customer, fullName: 'Patient B', language: 'en' },
      { ...customer, fullName: 'Patient C', language: 'en', checkupReason: 'Work Permit' },
      { ...customer, fullName: 'Patient D', branch: 'hn' },
    ], 'both', true, (done, total) => progress.push([done, total]));
    assert.equal(fonts, 6, 'four shared Arial fonts and two legacy Times fonts');
    assert.equal(saves, 1, 'no intermediate PDF serialization');
    assert.deepEqual(progress, [[1,4],[2,4],[3,4],[4,4]]);
    const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
    assert.equal(pdf.getPageCount(), 68); // 12 + 18 + 28 + 10
    for (const [name, start, end] of [['PATIENT A',0,12],['PATIENT B',12,30],['PATIENT C',30,58],['PATIENT D',58,68]]) {
      const pages = names.filter(([text]) => text === name).map(([, page]) => page);
      assert.ok(pages.length > 0, name);
      assert.ok(pages.every((page) => page >= start && page < end), name);
    }
  } finally {
    PDFDocument.prototype.embedFont = originalEmbed;
    PDFDocument.prototype.save = originalSave;
    PDFPage.prototype.drawText = originalDraw;
    if (url) URL.revokeObjectURL(url);
  }
});

test('non-corporate printing duplicates complete filled TT25 sets, keeping consent/refusal single', async () => {
  const service = loadPdfFixtures('tt25HcmPdfService');
  const bulk = loadPdfFixtures();
  const contents = (pdf, index) => (pdf.getPage(index).node.Contents()?.asArray() ?? [])
    .map((ref) => pdf.context.lookup(ref).getContents());
  for (const [branch, language, checkupReason, pages, consentPages] of [
    ['q1', 'vi', 'Work Permit', 12, 2],
    ['q7', 'en', 'Work Permit', 12, 4],
    ['q1', 'vi', 'Khám sức khỏe khác', 9, 2],
    ['q7', 'en', 'Khám sức khỏe khác', 13, 4],
    ['hn', 'vi', 'Khám sức khỏe khác', 7, 2],
  ]) {
    const data = { ...customer, branch, language, checkupReason };
    const result = await service.generateTT25OriginalPdf(data);
    try {
      const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
      const secondStart = pages + pages % 2;
      assert.equal(pdf.getPageCount(), secondStart + pages);
      for (let page = 0; page < pages; page++) {
        assert.deepEqual(contents(pdf, page), contents(pdf, secondStart + page), 'each copied page preserves filled content');
      }
      if (pages % 2) assert.deepEqual(contents(pdf, pages), [], 'duplex separator is blank');
    } finally { URL.revokeObjectURL(result.url); }
    for (const duplex of [false, true]) {
      const url = await bulk.generateBulkPrintPdf([data], 'both', duplex);
      try {
        const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
        assert.equal(pdf.getPageCount(), consentPages + 2 * (pages + (duplex ? pages % 2 : 0)));
      } finally { URL.revokeObjectURL(url); }
    }
    const url = await bulk.generateBulkPrintPdf([data], 'consent', true);
    try {
      const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
      assert.equal(pdf.getPageCount(), consentPages, 'consent and refusal are not duplicated');
    } finally { URL.revokeObjectURL(url); }
  }
});
