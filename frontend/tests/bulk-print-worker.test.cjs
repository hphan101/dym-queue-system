const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadClient() {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.terminated = 0; workers.push(this); }
    postMessage(request) { this.request = request; }
    terminate() { this.terminated++; }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/registration/bulkPrintPdf.ts'), 'utf8')
    .replace('import.meta.url', JSON.stringify('https://example.test/bulkPrintPdf.ts'));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {};
  new Function('exports', 'Worker', 'URL', 'Blob', code)(api, Worker, URL, Blob);
  return { api, workers };
}

test('bulk print delegates to a worker, forwards progress and creates the final URL on the main thread', async () => {
  const { api, workers } = loadClient();
  const items = [{ fullName: 'KHÁCH MẪU' }];
  const progress = [];
  const pending = api.generateBulkPrintPdf(items, 'both', (...args) => progress.push(args));
  const worker = workers[0];
  assert.equal(worker.options.type, 'module');
  assert.equal(worker.url.pathname, '/bulkPrintPdf.worker.ts');
  assert.deepEqual(worker.request, { items, mode: 'both' });
  worker.onmessage({ data: { type: 'progress', done: 1, total: 1 } });
  assert.deepEqual(progress, [[1, 1]]);
  assert.equal(worker.terminated, 0);
  worker.onmessage({ data: { type: 'complete', buffer: new TextEncoder().encode('%PDF-fixture').buffer } });
  const url = await pending;
  try {
    const response = await fetch(url);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(await response.text(), '%PDF-fixture');
    assert.equal(worker.terminated, 1);
  } finally { URL.revokeObjectURL(url); }
});

for (const failure of ['generation', 'worker', 'message', 'dispatch', 'progress']) {
  test(`bulk print rejects ${failure} failure and terminates the worker`, async () => {
    const { api, workers } = loadClient();
    const callback = failure === 'progress' ? () => { throw new Error('progress failed'); } : undefined;
    if (failure === 'dispatch') {
      // Make postMessage fail while the request is being dispatched.
      const originalPush = workers.push;
      workers.push = function (worker) {
        worker.postMessage = () => { throw new Error('dispatch failed'); };
        return originalPush.call(this, worker);
      };
    }
    const pending = api.generateBulkPrintPdf([], 'both', callback);
    const rejected = assert.rejects(pending);
    const worker = workers[0];
    if (failure === 'generation') worker.onmessage({ data: { type: 'error', message: 'missing template' } });
    if (failure === 'worker') worker.onerror();
    if (failure === 'message') worker.onmessageerror();
    if (failure === 'progress') worker.onmessage({ data: { type: 'progress', done: 1, total: 1 } });
    await rejected;
    assert.equal(worker.terminated, 1);
  });
}
