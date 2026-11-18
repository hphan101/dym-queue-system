const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('details motion reverses from its current height and skips keyboard/reduced-motion animation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/animateDetails.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  let reduced = false;
  new Function('exports', 'window', 'getComputedStyle', code)(exports,
    { matchMedia: () => ({ matches: reduced }) },
    () => ({ getPropertyValue: () => 'cubic-bezier(0.23, 1, 0.32, 1)' }));
  let animation = null;
  let visualHeight = null;
  const calls = [];
  const details = {
    open: false, dataset: {},
    getBoundingClientRect: () => ({ height: visualHeight ?? (details.open ? 240 : 40) }),
    getAnimations: () => animation ? [animation] : [],
    animate(frames, options) {
      calls.push({ frames, options });
      animation = { id: options.id, cancel() { animation = null; visualHeight = null; } };
      return animation;
    },
  };
  const summary = { parentElement: details, nextElementSibling: { getBoundingClientRect: () => ({ height: 200 }) } };
  const click = detail => exports.animateDetails({ currentTarget: summary, detail, preventDefault() {} });
  click(1);
  assert.deepEqual(calls[0].frames, [{ height: '40px' }, { height: '240px' }]);
  visualHeight = 120;
  click(1);
  assert.deepEqual(calls[1].frames, [{ height: '120px' }, { height: '40px' }]);
  animation.onfinish();
  assert.equal(details.open, false);
  assert.equal(details.dataset.motionTarget, undefined);
  click(0);
  assert.equal(details.open, true);
  assert.equal(calls.length, 2);
  reduced = true;
  click(1);
  assert.equal(details.open, false);
  assert.equal(calls.length, 2);
});
