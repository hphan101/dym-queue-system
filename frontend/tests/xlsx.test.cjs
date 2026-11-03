const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const exportsForTest = {};
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/xlsx.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', code)(exportsForTest);
const { columnLetter, createZipArchive, escapeXml, neutralizeSpreadsheetFormula } = exportsForTest;

test('shared Excel helpers preserve XML escaping, Vietnamese text and formula protection', () => {
  assert.equal(escapeXml('Công ty <DYM> & "Khách"\u0000\u0001\t\n'), 'Công ty &lt;DYM&gt; &amp; &quot;Khách&quot;\t\n');
  assert.equal(escapeXml("O'Brien"), 'O&apos;Brien');
  for (const value of ['=SUM(A1)', '+123', '-123', '@name', '  =SUM(A1)', '\ttext', '\rtext']) {
    assert.equal(neutralizeSpreadsheetFormula(value), `'${value}`);
  }
  assert.equal(neutralizeSpreadsheetFormula('Nguyễn Văn An'), 'Nguyễn Văn An');
  assert.deepEqual([1, 26, 27, 52, 53, 702, 703, 16384].map(columnLetter), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD']);
});

test('shared ZIP output is byte-identical to both original Excel exporters', () => {
  const samples = [
    [],
    [{ name: 'empty.txt', data: new Uint8Array() }],
    [{ name: 'xl/worksheets/sheet1.xml', data: new TextEncoder().encode('<data>Khách &amp; nhân viên</data>') },
      { name: 'Dữ liệu.txt', data: new Uint8Array([0, 1, 2, 255]) }],
  ];
  // Captured from both original exporters before extracting their common code.
  const expected = [
    '8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85',
    'beec6bd0e7e686a17b1f63bc85cdb3dd3b2121988a7108f967b7eb12e253dd17',
    '8f06435a9c7a3e7aca6ee343ff598f160a301b0c671c83d20ac39351b49f5044',
  ];
  for (let i = 0; i < samples.length; i++) {
    assert.equal(crypto.createHash('sha256').update(createZipArchive(samples[i])).digest('hex'), expected[i]);
  }
});
