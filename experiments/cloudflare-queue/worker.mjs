import { DurableObject } from 'cloudflare:workers';
import { controlPage } from './control.mjs';

const dayInVietnam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});
const html = (body) => new Response(body, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
});

export class QueueEvents extends DurableObject {
  fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket required' }, 426);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  changed() {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send('changed');
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      return json({ error: 'Local pilot only' }, 403);
    }
    if (request.method === 'GET' && url.pathname === '/') return html(controlPage);

    const route = /^\/(api|tv)\/(q1|q7)(?:\/(register|call-next|display|events))?$/.exec(url.pathname);
    if (!route) return json({ error: 'Route not found' }, 404);

    const [, surface, branch, action] = route;
    const isGet = request.method === 'GET';
    if (surface === 'tv') {
      if (!isGet || action) return json({ error: 'Route not found' }, 404);
      return html(displayPage(branch));
    }

    const isPost = request.method === 'POST';
    const now = Date.now();
    const day = dayInVietnam.format(now);
    if (isGet && action === 'events') return env.QUEUE_EVENTS.getByName(branch).fetch(request);

    if (isPost && action === 'register') {
      const body = await request.json().catch(() => null);
      const demoCode = body?.demoCode;
      if (typeof demoCode !== 'string' || !/^DEMO-[A-Z0-9-]{1,40}$/.test(demoCode)) {
        return json({ error: 'Provide a synthetic DEMO- code' }, 400);
      }

      // A single SQLite write checks the cooldown and issues the next number atomically.
      const row = await env.DB.prepare(`
        insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at)
        select ?1, ?2, ?3, (
          select coalesce(max(queue_number), 0) + 1
          from registrations where branch = ?2 and queue_date = ?3
        ), ?4, ?5
        where not exists (
          select 1 from registrations
          where branch = ?2 and demo_code = ?4 and registered_at > ?5 - 3600000
        )
        returning branch, queue_date, queue_number
      `).bind(crypto.randomUUID(), branch, day, demoCode, now).first();

      return row ? json(row, 201) : json({ error: 'Duplicate demo code within one hour' }, 409);
    }

    if (isPost && action === 'call-next') {
      const row = await env.DB.prepare(`
        update registrations set called_at = ?3
        where id = (
          select id from registrations
          where branch = ?1 and queue_date = ?2 and called_at is null
          order by queue_number limit 1
        )
        returning branch, queue_date, queue_number
      `).bind(branch, day, now).first();

      if (row) {
        // A failed notification cannot undo an already committed call.
        ctx.waitUntil(env.QUEUE_EVENTS.getByName(branch).changed().catch(console.error));
      }
      return json(row);
    }

    if (isGet && action === 'display') {
      const row = await env.DB.prepare(`
        select branch, queue_date, queue_number from registrations
        where branch = ?1 and queue_date = ?2 and called_at is not null
        order by queue_number desc limit 1
      `).bind(branch, day).first();
      return json(row);
    }

    return json({ error: 'Route not found' }, 404);
  },
};

function displayPage(branch) {
  return `<!doctype html>
<html lang="vi">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Màn hình gọi số • ${branch.toUpperCase()}</title>
<style>
  body { margin: 0; background: #141c2c; color: #fff; font: 24px system-ui, sans-serif; }
  main { min-height: 100vh; display: grid; align-content: center; justify-items: center; gap: 1rem; }
  h1, p { margin: 0; font-size: 1rem; } output { font-size: clamp(4rem, 22vw, 14rem); line-height: 1; }
  #status { color: #bac8dc; }
</style>
<main>
  <h1>Số đang gọi · ${branch.toUpperCase()}</h1>
  <output id="number" aria-live="polite">—</output>
  <p id="status" role="status">Đang kết nối</p>
</main>
<script type="module">
  const number = document.querySelector('#number');
  const status = document.querySelector('#status');
  let latestRequest = 0;
  let socket;
  let retry;
  async function refresh() {
    if (!navigator.onLine) return;
    const requestId = ++latestRequest;
    try {
      const result = await fetch('/api/${branch}/display');
      if (!result.ok) throw new Error('Không tải được số đang gọi');
      const row = await result.json();
      if (requestId === latestRequest) number.value = row ? String(row.queue_number).padStart(3, '0') : '—';
    } catch {
      if (requestId === latestRequest) status.textContent = 'Đang thử tải lại';
    }
  }
  function connect() {
    clearTimeout(retry);
    if (!navigator.onLine || socket) return;
    const url = new URL('/api/${branch}/events', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(url);
    socket = connection;
    connection.addEventListener('open', () => {
      if (socket !== connection) return;
      status.textContent = 'Đã kết nối';
      refresh();
    });
    connection.addEventListener('message', refresh);
    connection.addEventListener('close', () => {
      if (socket !== connection) return;
      socket = undefined;
      status.textContent = 'Đang kết nối lại';
      retry = setTimeout(connect, 2000);
    });
    connection.addEventListener('error', () => connection.close());
  }
  window.addEventListener('offline', () => {
    latestRequest++;
    status.textContent = 'Đang kết nối lại';
    const disconnected = socket;
    socket = undefined;
    disconnected?.close();
  });
  window.addEventListener('online', () => { connect(); refresh(); });
  connect();
  refresh();
  setInterval(refresh, 15000);
</script>
</html>`;
}
