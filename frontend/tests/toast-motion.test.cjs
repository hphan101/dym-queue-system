const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

test('Astryx toast keeps its grid transition but drops padding in the emitted CSS', async () => {
  const { default: config } = await import('../postcss.config.js');
  const file = path.resolve(__dirname, '../node_modules/@astryxdesign/core/dist/astryx.css');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /transition-property:grid-template-rows,padding/);
  const { css } = await postcss([config.plugins[0]]).process(source, { from: file });
  assert.doesNotMatch(css, /transition-property:[^;{}]*padding/);
  assert.match(css, /transition-property:grid-template-rows/);
  const other = '.other { transition-property: grid-template-rows, padding; }';
  assert.equal((await postcss([config.plugins[0]]).process(other, { from: 'other.css' })).css, other);
});
