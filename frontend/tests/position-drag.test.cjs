const { rosterPath, rosterImport } = require('./helpers/roster-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.resolve(__dirname, '../src/features/admin/roster');
function load(file, resolve) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(rosterPath(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(result, resolve);
  return result;
}
const order = load('campaignPositionOrder.ts', () => ({}));

test('clinic room order keeps stable room keys and appends new rooms without reviving hidden rooms', () => {
  const rooms = ['room:1', 'room:2', 'override:3'];
  assert.deepEqual(order.applySavedPositionOrder(rooms, ['override:3', 'room:hidden', 'room:1', 'room:1']), ['override:3', 'room:1', 'room:2']);
  assert.deepEqual(order.applySavedPositionOrder(rooms), rooms);
  assert.deepEqual(rooms, ['room:1', 'room:2', 'override:3']);
});

test('drop lines represent insertion before/after the hovered row without off-by-one moves', () => {
  const rows = [{ name: 'A', top: 100, height: 40 }, { name: 'B', top: 140, height: 40 }, { name: 'C', top: 180, height: 40 }];
  const beforeC = order.findPositionDropTarget(rows, 'A', 190);
  const afterC = order.findPositionDropTarget(rows, 'A', 215);
  assert.deepEqual(beforeC, { target: 'C', edge: 'before' });
  assert.deepEqual(afterC, { target: 'C', edge: 'after' });
  assert.deepEqual(order.insertCampaignPosition(['A', 'B', 'C'], 'A', beforeC), ['B', 'A', 'C']);
  assert.deepEqual(order.insertCampaignPosition(['A', 'B', 'C'], 'A', afterC), ['B', 'C', 'A']);
  assert.deepEqual(order.insertCampaignPosition(['A', 'B', 'C'], 'C', { target: 'A', edge: 'before' }), ['C', 'A', 'B']);
  assert.equal(order.findPositionDropTarget([rows[0]], 'A', 100), null);
});

function gesture({ fail = false, disabled = false } = {}) {
  const slots = [];
  let cursor = 0;
  let server = ['A', 'B', 'C'];
  let displayed = server;
  const writes = [], errors = [];
  let finish;
  const pending = new Promise((resolve, reject) => { finish = fail ? () => reject(new Error('Offline')) : resolve; });
  const react = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useLayoutEffect() {},
  };
  const module = load('useCampaignPositionDrag.ts', (name) => rosterImport(name) === 'react' ? react : order);
  const view = { scrollY: 0, innerHeight: 1000, scrollBy(x, y) { this.scrollY += y; } };
  const body = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({ left: 0, right: 600, top: 100, bottom: 220 }),
    querySelectorAll: () => displayed.map((name, index) => ({ dataset: { position: name }, getBoundingClientRect: () => ({ top: 100 + index * 40, height: 40 }) })),
  };
  const props = { campaignId: 'campaign', disabled, onSave: async (next) => { writes.push(next); await pending; server = next; }, onError: (error) => errors.push(error) };
  const render = () => { cursor = 0; const api = module.useCampaignPositionDrag({ ...props, positions: server }); displayed = api.positions; api.bodyRef.current = body; return api; };
  const event = (y) => ({ button: 0, pointerId: 1, clientX: 20, clientY: y, preventDefault() {}, currentTarget: { focus() {}, setPointerCapture() {}, ownerDocument: { defaultView: view } } });
  return { render, event, writes, errors, finish };
}

test('dragging follows the pointer, previews the new order immediately and persists only on drop', async () => {
  const g = gesture();
  let api = g.render();
  api.handleProps('A').onPointerDown(g.event(120));
  api = g.render();
  api.handleProps('A').onPointerMove(g.event(215));
  api = g.render();
  assert.equal(api.drag.offset, 95);
  assert.deepEqual(api.drop, { target: 'C', edge: 'after' });
  assert.equal(g.writes.length, 0);
  api.handleProps('A').onPointerUp(g.event(215));
  assert.deepEqual(g.render().positions, ['B', 'C', 'A']);
  assert.deepEqual(g.writes, [['B', 'C', 'A']]);
  g.finish();
  await new Promise(setImmediate);
  assert.deepEqual(g.render().positions, ['B', 'C', 'A']);
  assert.deepEqual(g.errors, []);
});

test('cancelled or locked gestures never save, and a failed save restores the prior order', async () => {
  const cancelled = gesture();
  let api = cancelled.render();
  api.handleProps('A').onPointerDown(cancelled.event(120));
  api.handleProps('A').onPointerCancel();
  api.handleProps('A').onPointerUp(cancelled.event(215));
  assert.equal(cancelled.writes.length, 0);
  const locked = gesture({ disabled: true });
  locked.render().handleProps('A').onPointerDown(locked.event(120));
  assert.equal(locked.render().drag, null);
  const failed = gesture({ fail: true });
  api = failed.render();
  api.handleProps('A').onPointerDown(failed.event(120));
  api.handleProps('A').onPointerUp(failed.event(215));
  assert.deepEqual(failed.render().positions, ['B', 'C', 'A']);
  failed.finish();
  await new Promise(setImmediate);
  assert.deepEqual(failed.render().positions, ['A', 'B', 'C']);
  assert.deepEqual(failed.errors, ['Offline']);
});
