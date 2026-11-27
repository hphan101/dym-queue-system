import { DurableObject } from 'cloudflare:workers';
import { controlPage } from './control.mjs';
import { callNext, receptionApi, registrationNotice } from './reception.mjs';
import { dailyQueueLimit, equalSecret, getStaffSession, nextQueueNumberSql, previewAccess, registerPreview } from './access.mjs';
import { branchAllowed, managePreviewStaff, previewBranches, staffCan } from './staff.mjs';
import { previewPersonnelDocuments } from './personnel-documents.mjs';
import { purgeExpiredPreviewSessions } from './expired-sessions.mjs';

const dayInVietnam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});
const html = (body) => new Response(body, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
});
const readOnlyPosts = new Set([
  '/functions/v1/login', '/functions/v1/preview-logout',
  '/rest/v1/rpc/get_dashboard_registrations', '/rest/v1/rpc/get_registration_details',
  '/rest/v1/rpc/get_reception_trend', '/rest/v1/rpc/get_registration_failures',
]);

function writePaused(env) {
  return env.DYM_CUTOVER_READ_ONLY === '1';
}

export class QueueEvents extends DurableObject {
  fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket required' }, 426);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const staff = new URL(request.url).searchParams.has('staff');
    this.ctx.acceptWebSocket(server, staff ? ['staff'] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  changed(registrationId) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      // Even staff sockets carry only the ID. The detail request rechecks current access.
      const sendNotice = registrationId && this.ctx.getTags(socket).includes('staff');
      socket.send(sendNotice ? `registered:${registrationId}` : 'changed');
    }
  }
}

export default {
  async scheduled(controller, env) {
    if (!writePaused(env)) await purgeExpiredPreviewSessions(env.DB, controller.scheduledTime);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const now = Date.now();
    const application = Boolean(env.DYM_APP_ORIGIN);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    let staffSession;
    const getStaff = () => staffSession ??= getStaffSession(request, env.DB, now, !application);
    if (application) {
      if (url.origin !== env.DYM_APP_ORIGIN || (url.protocol !== 'https:' && !local)
        || env.DEMO_HOST || env.DEMO_PASSWORD || (env.REGISTRATION_FINGERPRINT_SECRET?.length ?? 0) < 32) {
        return json({ error: 'Not found' }, 404);
      }
      if (url.pathname === '/demo') return json({ error: 'Not found' }, 404);
    } else if (env.DEMO_HOST) {
      if (url.hostname !== env.DEMO_HOST || !env.DEMO_PASSWORD) return json({ error: 'Not found' }, 404);
      const expected = `Basic ${btoa(`demo:${env.DEMO_PASSWORD}`)}`;
      if (!equalSecret(request.headers.get('Authorization'), expected) && !await getStaff()) {
        return new Response('Cần đăng nhập để mở bản thử DYM.', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="DYM demo"', 'Cache-Control': 'no-store' },
        });
      }
    } else if (!local) {
      return json({ error: 'Local pilot only' }, 403);
    }
    if ((application || env.DEMO_HOST) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      && request.headers.get('Origin') !== url.origin) {
      return json({ error: 'Origin not allowed' }, 403);
    }
    if (writePaused(env) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      && !(request.method === 'POST' && readOnlyPosts.has(url.pathname))) {
      return Response.json({
        code: 'CUTOVER_READ_ONLY',
        error: 'Hệ thống đang tạm dừng nhận thay đổi. Vui lòng thử lại sau ít phút.',
      }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
    }
    const day = dayInVietnam.format(now);
    const notify = (branch, registrationId = null) => ctx.waitUntil(env.QUEUE_EVENTS.getByName(branch).changed(registrationId).catch(console.error));
    if (url.pathname.startsWith('/functions/v1/')) {
      const action = url.pathname.slice('/functions/v1/'.length);
      if (action === 'register') return registerPreview(request, env.DB, day, now, notify,
        application ? env.REGISTRATION_FINGERPRINT_SECRET : env.PREVIEW_QR_SECRET, !application);
      if (action === 'manage-staff') return managePreviewStaff(request, env.DB, await getStaff(), now, !application);
      if (action === 'personnel-documents') return previewPersonnelDocuments(request, env, await getStaff());
      return await previewAccess(request, env, action, day, now, getStaff, notify) ?? json({ code: 'NOT_FOUND' }, 404);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const path = url.pathname.slice('/rest/v1/'.length);
      const staff = await getStaff();
      if (!['branches', 'branch_display_state'].includes(path) && !staff) {
        return json({ code: 'AUTH_REQUIRED', message: 'Vui lòng đăng nhập.' }, 401);
      }
      return receptionApi(request, env, day, now, notify, staff);
    }

    if (request.method === 'GET') {
      if (!application && (url.pathname === '/demo' || (!env.ASSETS && url.pathname === '/'))) return html(controlPage);
      if (env.ASSETS && url.pathname === '/' && !url.search) return Response.redirect(new URL('/?page=admin&branch=q1', url));
    }

    const route = /^\/(api|tv)\/([a-z0-9]+)(?:\/(register|call-next|display|events|registration-notice))?$/.exec(url.pathname);
    if (!route || !previewBranches.includes(route[2])) {
      if (request.method === 'GET' && env.ASSETS && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      return json({ error: 'Route not found' }, 404);
    }

    const [, surface, branch, action] = route;
    const isGet = request.method === 'GET';
    if (surface === 'tv') {
      if (!isGet || action) return json({ error: 'Route not found' }, 404);
      if (application || env.ASSETS) return Response.redirect(new URL(`/display?branch=${branch}`, url));
      return html(displayPage(branch));
    }

    const isPost = request.method === 'POST';
    if (isGet && action === 'events') {
      if (url.searchParams.has('staff')) {
        if (request.headers.get('Origin') !== url.origin) return json({ code: 'ACCESS_DENIED' }, 403);
        const staff = await getStaff();
        if (!staff) return json({ code: 'AUTH_REQUIRED' }, 401);
        if (!branchAllowed(staff, branch) || !(staffCan(staff, 'reception') || staffCan(staff, 'registrations'))) {
          return json({ code: 'ACCESS_DENIED' }, 403);
        }
      }
      return env.QUEUE_EVENTS.getByName(branch).fetch(request);
    }
    if (isGet && action === 'registration-notice') {
      return registrationNotice(env.DB, branch, url.searchParams.get('id'), await getStaff());
    }

    if (isPost && action === 'register') {
      if (application) return json({ error: 'Not found' }, 404);
      const body = await request.json().catch(() => null);
      const demoCode = body?.demoCode;
      if (typeof demoCode !== 'string' || !/^DEMO-[A-Z0-9-]{1,40}$/.test(demoCode)) {
        return json({ error: 'Provide a synthetic DEMO- code' }, 400);
      }

      // A single SQLite write checks the cooldown and issues the next number atomically.
      const id = crypto.randomUUID();
      const row = await env.DB.prepare(`
        with next_ticket as (${nextQueueNumberSql})
        insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at)
        select ?, ?, ?, number, ?, ? from next_ticket
        where number <= ? and not exists (
          select 1 from registrations r left join preview_registration_edits e on e.registration_id = r.id
          where r.branch = ? and r.registered_at > ?
            and coalesce(e.details ->> '$.identityDocument', r.demo_code) = ?
        )
        returning branch, queue_date, queue_number
      `).bind(branch, day, id, branch, day, demoCode, now, dailyQueueLimit, branch, now - 3600000, demoCode).first();

      if (row) notify(branch, id);
      return row ? json(row, 201) : json({ error: 'Duplicate demo code within one hour or daily queue is full' }, 409);
    }

    if (isPost && action === 'call-next') {
      const staff = await getStaff();
      if (application || env.ASSETS) {
        if (!staff) return json({ code: 'AUTH_REQUIRED' }, 401);
        if (!branchAllowed(staff, branch) || !staffCan(staff, 'reception', 'update')) return json({ code: 'ACCESS_DENIED' }, 403);
      }
      const row = await callNext(env.DB, branch, day, now, staff?.id);
      if (row) notify(branch);
      return json(row);
    }

    if (isGet && action === 'display') {
      const row = await env.DB.prepare(`
        select branch, queue_date, queue_number from display_state
        where branch = ?1 and queue_date = ?2 and registration_id is not null
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
