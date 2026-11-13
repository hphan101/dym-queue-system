const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, PDFPage, decodePDFRawStream } = require('pdf-lib');
const { loadPdfFixtures } = require('./helpers/pdf-fixtures.cjs');
const { customer } = require('./tt25-pdf.test.cjs');

test('bulk PDF generation does not depend on timers throttled in background tabs', async () => {
  const bulk = loadPdfFixtures();
  const original = global.setTimeout;
  let timers = 0;
  let url;
  global.setTimeout = (...args) => { timers++; return original(...args); };
  try {
    url = await bulk.generateBulkPrintPdf([customer], 'both');
  } finally {
    global.setTimeout = original;
    if (url) URL.revokeObjectURL(url);
  }
  assert.equal(timers, 0, 'building and saving must not await background timers');
});

const profiles = {
  viCompany: { branch: 'q1', language: 'vi', checkupReason: customer.checkupReason, pages: 8, copies: 1, consent: 2 },
  viOther: { branch: 'q7', language: 'vi', checkupReason: 'Khám sức khỏe khác', pages: 8, copies: 2, consent: 2 },
  enCompany: { branch: 'q7', language: 'en', checkupReason: customer.checkupReason, pages: 12, copies: 1, consent: 4 },
  enOther: { branch: 'q1', language: 'en', checkupReason: 'Khám sức khỏe khác', pages: 12, copies: 2, consent: 4 },
  viWp: { branch: 'q1', language: 'vi', checkupReason: 'Work Permit', pages: 12, copies: 2, consent: 2 },
  enWp: { branch: 'q7', language: 'en', checkupReason: 'Khám sức khỏe bổ sung hồ sơ xin Work Permit', pages: 12, copies: 2, consent: 4 },
  hnWp: { branch: 'hn', language: 'en', checkupReason: 'Work Permit', pages: 12, copies: 2, consent: 4, blank: true },
  hnCompany: { branch: 'hn', language: 'vi', checkupReason: customer.checkupReason, pages: 8, copies: 1, consent: 2 },
  hnOther: { branch: 'hn', language: 'en', checkupReason: 'Khám sức khỏe cá nhân tự nguyện', pages: 12, copies: 2, consent: 4 },
};

for (const order of [
  ['viOther', 'viCompany'], ['viCompany', 'viOther'], ['viOther', 'viOther'],
  ['enOther', 'enCompany'], ['enCompany', 'enOther'], ['enOther', 'enOther'],
  ['viWp', 'viCompany'], ['viCompany', 'viWp'], ['viWp', 'enWp'],
  ['hnOther', 'hnCompany'], ['hnCompany', 'hnOther'], ['hnWp', 'hnCompany'], ['hnWp', 'enOther', 'viCompany'],
  ['viOther', 'enCompany', 'enWp', 'hnOther', 'viCompany'],
]) {
  test(`mixed print order ${order.join(' -> ')} across all modes with the configured templates`, async () => {
    const bulk = loadPdfFixtures();
    const items = order.map((key, index) => ({ ...customer, ...profiles[key], fullName: ['ĐỖ THỊ ÁNH', 'NGUYỄN VĂN QUÝ', 'TRẦN THỊ DIỄM', 'LÊ HỒNG PHƯỚC', 'VŨ THỊ HƯƠNG'][index] }));
    for (const mode of ['consent', 'tt25', 'both']) {
        let expected = 0;
        const blanks = [];
        for (const key of order) {
          const profile = profiles[key];
          if (mode !== 'tt25') {
            expected += profile.consent;
          }
          if (mode !== 'consent') {
            for (let copy = 0; copy < profile.copies; copy++) {
              if (profile.blank) blanks.push(expected + profile.pages - 1);
              expected += profile.pages;
            }
          }
        }
        const url = await bulk.generateBulkPrintPdf(items, mode);
        try {
          const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
          assert.equal(pdf.getPageCount(), expected, mode);
          for (const index of blanks) assert.equal(pdf.getPage(index).node.Contents()?.asArray().length ?? 0, 0, `blank separator ${index}`);
        } finally { URL.revokeObjectURL(url); }
    }
  });
}

test('a two-copy customer can precede a one-copy customer using the same fonts', async () => {
  const bulk = loadPdfFixtures();
  const url = await bulk.generateBulkPrintPdf([
    { ...customer, fullName: 'Patient A', checkupReason: 'Khám sức khỏe khác' },
    { ...customer, fullName: 'Patient B' },
  ], 'both');
  try {
    const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
    assert.equal(pdf.getPageCount(), 28);
  } finally { URL.revokeObjectURL(url); }
});

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
    ], 'both', (done, total) => progress.push([done, total]));
    assert.equal(fonts, 4, 'all branch templates share four Arial fonts');
    assert.equal(saves, 1, 'no intermediate PDF serialization');
    assert.deepEqual(progress, [[1,4],[2,4],[3,4],[4,4]]);
    const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
    assert.equal(pdf.getPageCount(), 64); // 10 + 16 + 28 + 10
    for (const [name, start, end] of [['PATIENT A',0,10],['PATIENT B',10,26],['PATIENT C',26,54],['PATIENT D',54,64]]) {
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
    .map((ref) => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1')
      .replace(/\/[^\s/]+(?=\s+[\d.]+\s+Tf\b)/g, '/FONT'));
  for (const [branch, language, checkupReason, pages, consentPages] of [
    ['q1', 'vi', 'Work Permit', 12, 2],
    ['q7', 'en', 'Work Permit', 12, 4],
    ['q1', 'vi', 'Khám sức khỏe khác', 8, 2],
    ['q7', 'en', 'Khám sức khỏe khác', 12, 4],
    ['hn', 'vi', 'Khám sức khỏe khác', 8, 2],
    ['hn', 'en', 'Khám sức khỏe khác', 12, 4],
    ['hn', 'vi', 'Work Permit', 12, 2],
    ['hn', 'en', 'Work Permit', 12, 4],
  ]) {
    const data = { ...customer, branch, language, checkupReason };
    const result = await service.generateTT25OriginalPdf(data);
    try {
      const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
      const secondStart = pages;
      assert.equal(pdf.getPageCount(), secondStart + pages);
      for (let page = 0; page < pages; page++) {
        assert.deepEqual(contents(pdf, page), contents(pdf, secondStart + page), 'each copied page preserves filled content');
      }
      if (branch === 'hn' && checkupReason === 'Work Permit') assert.deepEqual(contents(pdf, pages - 1), [], 'Hanoi WP template separator is blank');
      else for (let page = 0; page < pdf.getPageCount(); page++) assert.ok(contents(pdf, page).length > 0, 'templates contain no extra blank pages');
    } finally { URL.revokeObjectURL(result.url); }
    {
      const url = await bulk.generateBulkPrintPdf([data], 'both');
      try {
        const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
        assert.equal(pdf.getPageCount(), consentPages + 2 * pages);
      } finally { URL.revokeObjectURL(url); }
    }
    const url = await bulk.generateBulkPrintPdf([data], 'consent');
    try {
      const pdf = await PDFDocument.load(await (await fetch(url)).arrayBuffer());
      assert.equal(pdf.getPageCount(), consentPages, 'consent and refusal are not duplicated');
    } finally { URL.revokeObjectURL(url); }
  }
});
