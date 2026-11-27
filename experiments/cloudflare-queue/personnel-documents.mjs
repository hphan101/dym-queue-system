import { staffCan } from './staff.mjs';

const limit = 10 * 1024 * 1024;
const kinds = ['identity', 'certificate'];
const personPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const validPerson = (person, preview) => personPattern.test(person ?? '') || (preview && /^staff-demo-[12]$/.test(person ?? ''));
const idPattern = /^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const mime = {
  pdf: ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]],
  jpg: ['image/jpeg', [0xff, 0xd8, 0xff]],
  jpeg: ['image/jpeg', [0xff, 0xd8, 0xff]],
  png: ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};
const columns = 'id, personnel_id, kind, object_path, file_name, mime_type, file_size, created_at, state';
const headers = { 'Cache-Control': 'no-store' };
const response = (data, status = 200) => Response.json(data, { status, headers });
const unavailable = () => response({ message: 'Chưa kết nối được kho tệp riêng.' }, 503);
const notFound = () => response({ message: 'Không tìm thấy tệp hoặc nhân sự.' }, 404);
const busy = () => response({ message: 'Tệp đang được xóa. Vui lòng tải lại danh sách.' }, 409);
const hex = data => [...new Uint8Array(data)].map(number => number.toString(16).padStart(2, '0')).join('');
const digest = async data => hex(await crypto.subtle.digest('SHA-256', data));

async function readBytes(request) {
  if (!request.body || Number(request.headers.get('Content-Length')) > limit) return null;
  const source = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await source.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await source.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    source.releaseLock();
  }
  if (!bytes) return null;
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function readDocument(db, id) {
  return db.prepare('select ' + columns + ' from preview_personnel_documents where id = ?').bind(id).first();
}

function publicDocument({ state, ...row }) {
  return row;
}

async function saveDocument(request, env, url, preview) {
  const person = url.searchParams.get('personnelId');
  const kind = url.searchParams.get('kind');
  let name;
  try { name = decodeURIComponent(request.headers.get('X-File-Name') ?? ''); } catch { name = ''; }
  if (!validPerson(person, preview) || !kinds.includes(kind)) return notFound();
  if (preview && !/^DEMO-[A-Z0-9][A-Z0-9_.-]{0,230}\.(pdf|png|jpe?g)$/i.test(name)) {
    return response({ message: 'Dùng tệp giả có tên bắt đầu bằng DEMO-, ví dụ DEMO-CCCD.pdf.' }, 400);
  }
  const extension = name.split('.').at(-1).toLowerCase();
  if (name.length > 255 || /[\x00-\x1f\x7f-\x9f/\\]/.test(name) || !Object.hasOwn(mime, extension)
    || !name.slice(0, -(extension.length + 1)).trim()) {
    return response({ message: 'Tên tệp không hợp lệ.' }, 400);
  }
  const [mediaType, signature] = mime[extension];
  if (request.headers.get('Content-Type') !== mediaType) return response({ message: 'Chỉ nhận file PDF, JPG hoặc PNG.' }, 400);
  const personFound = await env.DB.prepare("select 1 from preview_roster_samples where resource = 'medical_personnel' and id = ?")
    .bind(person).first();
  if (!personFound) return notFound();

  const bytes = await readBytes(request);
  if (!bytes) return response({ message: 'File phải có nội dung và không vượt quá 10 MB.' }, 413);
  if (!signature.every((byte, i) => byte === bytes[i])) return response({ message: 'Nội dung file không khớp định dạng.' }, 400);

  const id = await digest(new TextEncoder().encode(JSON.stringify([person, kind, name, await digest(bytes)])));
  const existing = await readDocument(env.DB, id);
  if (existing) return existing.state === 'ready' ? response(publicDocument(existing)) : busy();

  const objectPath = person + '/' + kind + '/' + crypto.randomUUID() + '.' + extension;
  // Use a separate object key per attempt so recovery can remove only the unlinked upload.
  try {
    await env.PERSONNEL_FILES.put(objectPath, bytes, { httpMetadata: { contentType: mediaType } });
    const row = await env.DB.prepare(
      'insert into preview_personnel_documents (id, personnel_id, kind, object_path, file_name, mime_type, file_size, created_at) ' +
      'values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do nothing returning ' + columns,
    ).bind(id, person, kind, objectPath, name, mediaType, bytes.byteLength, new Date().toISOString()).first();
    if (row) return response(publicDocument(row), 201);
  } catch {
    // Reconcile below even when the database response was lost.
  }

  const committed = await readDocument(env.DB, id);
  if (committed?.object_path !== objectPath) await env.PERSONNEL_FILES.delete(objectPath);
  if (committed?.state === 'deleting') return busy();
  if (committed) return response(publicDocument(committed));
  return unavailable();
}

export async function previewPersonnelDocuments(request, env, staff) {
  if (!staff) return response({ message: 'Vui lòng đăng nhập.' }, 401);
  const action = { GET: 'view', POST: 'create', DELETE: 'delete' }[request.method];
  if (!action) return response({ message: 'Thao tác không được hỗ trợ.' }, 405);
  if (!staffCan(staff, 'personnel_documents', action)) return response({ message: 'Tài khoản chưa được cấp quyền.' }, 403);
  if (!env.PERSONNEL_FILES) return unavailable();
  const url = new URL(request.url);
  const preview = !env.DYM_APP_ORIGIN;
  try {
    if (request.method === 'POST') return await saveDocument(request, env, url, preview);
    const id = url.searchParams.get('id');
    if (request.method === 'GET' && id === null) {
      const person = url.searchParams.get('personnelId');
      if (!validPerson(person, preview)) return notFound();
      const { results } = await env.DB.prepare(
        'select ' + columns + ' from preview_personnel_documents where personnel_id = ? order by created_at desc',
      ).bind(person).all();
      return response(results.map(publicDocument));
    }
    if (!idPattern.test(id ?? '')) return notFound();
    if (request.method === 'DELETE') {
      const document = await env.DB.prepare("update preview_personnel_documents set state = 'deleting' where id = ? returning object_path")
        .bind(id).first();
      if (document) {
        await env.PERSONNEL_FILES.delete(document.object_path);
        await env.DB.prepare("delete from preview_personnel_documents where id = ? and object_path = ? and state = 'deleting'")
          .bind(id, document.object_path).run();
      }
      return new Response(null, { status: 204, headers });
    }
    const document = await readDocument(env.DB, id);
    if (!document) return notFound();
    if (document.state !== 'ready') return busy();
    const file = await env.PERSONNEL_FILES.get(document.object_path);
    if (!file) return notFound();
    return new Response(file.body, { headers: {
      ...headers,
      'Content-Type': document.mime_type,
      'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(document.file_name)
        .replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16)),
      'Content-Length': String(file.size),
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return unavailable();
  }
}
