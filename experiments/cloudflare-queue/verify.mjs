import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8788';

async function request(branch, action, method = 'GET', payload) {
  const response = await fetch(`${base}/api/${branch}/${action}`, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload && JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, row: await response.json() };
}

function register(branch, demoCode) {
  return request(branch, 'register', 'POST', { demoCode });
}

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    socket.addEventListener(event, resolve, { once: true, signal: AbortSignal.timeout(10000) });
    socket.addEventListener('error', () => reject(new Error('WebSocket failed')), { once: true });
    const timeout = setTimeout(() => reject(new Error(`No WebSocket ${event}`)), 10000);
    socket.addEventListener(event, () => clearTimeout(timeout), { once: true });
    socket.addEventListener('error', () => clearTimeout(timeout), { once: true });
  });
}

assert.equal((await register('q1', 'real-data-not-accepted')).status, 400);

// Run on a fresh local D1 database so that the starting number is known.
const perBranch = { q1: 60, q7: 20 };
await Promise.all(Object.entries(perBranch).map(async ([branch, count]) => {
  const results = await Promise.all(Array.from({ length: count }, (_, i) => register(branch, `DEMO-${i}`)));
  assert(results.every(({ status, row }) => status === 201 && row.branch === branch));
  assert.deepEqual(results.map(({ row }) => row.queue_number).sort((a, b) => a - b),
    Array.from({ length: count }, (_, i) => i + 1));
}));

const duplicate = await Promise.all([register('q1', 'DEMO-SAME'), register('q1', 'DEMO-SAME')]);
assert.deepEqual(duplicate.map(({ status }) => status).sort(), [201, 409]);
assert.equal(duplicate.find(({ status }) => status === 201).row.queue_number, 61);
assert.equal((await register('q7', 'DEMO-SAME')).row.queue_number, 21);

const q1 = new WebSocket('ws://127.0.0.1:8788/api/q1/events');
const q7 = new WebSocket('ws://127.0.0.1:8788/api/q7/events');
try {
  await Promise.all([nextEvent(q1, 'open'), nextEvent(q7, 'open')]);
  let q7Notifications = 0;
  q7.addEventListener('message', () => { q7Notifications++; });
  const notification = nextEvent(q1, 'message');
  const calls = await Promise.all(Array.from({ length: 3 }, () => request('q1', 'call-next', 'POST')));
  assert.equal((await notification).data, 'changed');
  assert.deepEqual(calls.map(({ row }) => row.queue_number).sort((a, b) => a - b), [1, 2, 3]);
  assert.equal((await request('q1', 'display')).row.queue_number, 3);
  assert.equal((await request('q7', 'display')).row, null);
  assert.equal(q7Notifications, 0);

  const q7Event = nextEvent(q7, 'message');
  assert.equal((await request('q7', 'call-next', 'POST')).row.queue_number, 1);
  assert.equal((await q7Event).data, 'changed');
} finally {
  q1.close();
  q7.close();
}

const connectedAgain = new WebSocket('ws://127.0.0.1:8788/api/q1/events');
try {
  await nextEvent(connectedAgain, 'open');
  assert.equal((await request('q1', 'display')).row.queue_number, 3);
} finally {
  connectedAgain.close();
}

const tv = await fetch(`${base}/tv/q1`);
assert.equal(tv.status, 200);
assert.match(await tv.text(), /Số đang gọi · Q1/);
console.log('PASS: simultaneous registration, duplicate protection, branch isolation, simultaneous calls, WebSocket notifications and display state after reconnect.');
