import {
  createQrChallenge, createRegistrationSessionToken, hashRegistrationRequest, hashRegistrationSession,
  REGISTRATION_SESSION_MS, SESSION_TOKEN_PATTERN, verifyQrChallenge,
} from '../../supabase/functions/_shared/registrationAccess.ts';
import { editPreviewRegistration } from './customer-edit.mjs';
import { branchAllowed, loadStaffSession, loginStaff, previewBranches, staffCan } from './staff.mjs';
import { readPreviewRegistration } from './preview-registration-data.mjs';
import { readRegistration } from './registration-data.mjs';
import { registrationRetryAfter } from './registration-rate-limit.mjs';
import { countExpiredQrFailure, countSubmissionFailure } from './registration-failures.mjs';

const encoder = new TextEncoder();
const staffSessionMs = 8 * 60 * 60_000;
const cookieName = 'dym_preview_staff';

export function equalSecret(input, secret) {
  if (typeof input !== 'string' || typeof secret !== 'string') return false;
  const supplied = encoder.encode(input);
  const expected = encoder.encode(secret);
  return supplied.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(supplied, expected);
}

function result(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function readStaffToken(request) {
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  return token && SESSION_TOKEN_PATTERN.test(token) ? token : null;
}

function staffCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

export async function getStaffSession(request, db, now, allowDemo = true) {
  const token = readStaffToken(request);
  return token ? loadStaffSession(db, await hashRegistrationSession(`preview-staff|${token}`), now, allowDemo) : null;
}

export async function previewAccess(request, env, path, day, now, getStaff, notify) {
  if (request.method === 'GET' && path === 'preview-session') {
    const staff = await getStaff();
    return result({ user: staff ? { id: staff.id } : null });
  }
  if (request.method !== 'POST') return result({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (Number(request.headers.get('Content-Length')) > 4096) return result({ code: 'INVALID_DATA' }, 413);
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > 4096) return result({ code: 'INVALID_DATA' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (path === 'login') {
    const token = createRegistrationSessionToken();
    const hash = await hashRegistrationSession(`preview-staff|${token}`);
    const error = await loginStaff(env.DB, request, body, hash, now, staffSessionMs, env.DEMO_PASSWORD, equalSecret);
    if (error) return result({ success: false, code: error }, error === 'RATE_LIMITED' ? 429 : 401);
    return result({ success: true, session: { access_token: 'preview', refresh_token: 'preview' } }, 200,
      { 'Set-Cookie': staffCookie(request, token, staffSessionMs / 1000) });
  }
  if (path === 'preview-logout') {
    const token = readStaffToken(request);
    if (token) {
      const hash = await hashRegistrationSession(`preview-staff|${token}`);
      await env.DB.batch([
        env.DB.prepare('delete from preview_staff_sessions where token_hash = ?').bind(hash),
        env.DB.prepare('delete from preview_managed_staff_sessions where token_hash = ?').bind(hash),
      ]);
    }
    return result({ success: true }, 200, { 'Set-Cookie': staffCookie(request, '', 0) });
  }
  if (path !== 'registration-access') return null;
  const branch = body?.branch;
  if (!previewBranches.includes(branch)) return result({ code: 'INVALID_DATA' }, 400);
  const preview = !env.DYM_APP_ORIGIN;
  const secret = preview ? env.PREVIEW_QR_SECRET : env.REGISTRATION_FINGERPRINT_SECRET;
  if (!secret) return result({ code: 'SERVER_NOT_CONFIGURED' }, 503);
  if (body.action === 'qr') {
    const staff = await getStaff();
    if (!staff) return result({ code: 'AUTH_REQUIRED' }, 401);
    const permitted = body.purpose === 'staff' ? staffCan(staff, 'registrations', 'create') : staffCan(staff, 'registration_qr');
    if (!permitted || !branchAllowed(staff, branch)) return result({ code: 'ACCESS_DENIED' }, 403);
    return result({ success: true, branch, ...await createQrChallenge(branch, secret, now) });
  }
  const editing = body.action === 'edit-registration';
  if (body.action !== 'exchange' && !editing) return result({ code: 'INVALID_DATA' }, 400);
  if (editing && (typeof body.sessionToken !== 'string' || !SESSION_TOKEN_PATTERN.test(body.sessionToken))) {
    return result({ code: 'EDIT_SESSION_INVALID' }, 403);
  }
  if (!editing && (typeof body.challenge !== 'string' || await verifyQrChallenge(body.challenge, secret, now) !== branch)) {
    await countExpiredQrFailure(env.DB, branch, day, body.challenge, secret,
      request.headers.get('CF-Connecting-IP'), now).catch(() => {});
    return result({ code: 'QR_EXPIRED' }, 403);
  }
  const retryAfter = await registrationRetryAfter(env.DB, request.headers.get('CF-Connecting-IP')?.trim() || null, secret, now,
    editing ? 'edit' : 'access').catch(() => null);
  if (retryAfter === null) return result({ code: 'SERVER_ERROR' }, 503);
  if (retryAfter) return result({ code: 'RATE_LIMITED' }, 429, { 'Retry-After': String(retryAfter) });
  if (editing) return editPreviewRegistration(env.DB, branch, body, now, notify, preview);
  const sessionToken = createRegistrationSessionToken();
  const expiresAt = now + REGISTRATION_SESSION_MS;
  await env.DB.prepare('insert into preview_registration_sessions values (?, ?, ?)')
    .bind(await hashRegistrationSession(sessionToken), branch, expiresAt).run();
  return result({ success: true, branch, sessionToken, expiresAt: new Date(expiresAt).toISOString(), serverNow: new Date(now).toISOString() });
}

const identityCooldownMs = 60 * 60_000;
export const dailyQueueLimit = 9999;
export const nextQueueNumberSql = `
  select coalesce((select last_number from daily_queue_counters where branch = ? and queue_date = ?), 0) + 1 as number
`;
const latestSameDocument = `
  select max(r.registered_at) from registrations r left join preview_registration_edits e on e.registration_id = r.id
  where r.branch = ? and r.registered_at > ?
    and coalesce(e.details ->> '$.identityDocument', r.demo_code) = ?
    and coalesce(e.details ->> '$.tt25.identityDocumentType',
      case when length(r.demo_code) = 12 and r.demo_code not glob '*[^0-9]*' then 'cccd' else 'passport' end) = ?
`;

export async function registerPreview(request, db, day, now, notify, secret, preview = true) {
  if (request.method !== 'POST') return result({ code: 'METHOD_NOT_ALLOWED' }, 405);
  const limit = preview ? 24_000 : 16_384;
  if (Number(request.headers.get('Content-Length')) > limit) return result({ code: 'INVALID_DATA' }, 413);
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > limit) return result({ code: 'INVALID_DATA' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const branch = body?.branch;
  if (!previewBranches.includes(branch) || typeof body.registrationSession !== 'string' || !SESSION_TOKEN_PATTERN.test(body.registrationSession)) {
    return result({ code: 'REGISTRATION_SESSION_INVALID' }, 403);
  }
  const failure = async (details, status, headers) => {
    if (!body.honeypot) {
      await countSubmissionFailure(db, branch, day, details.code, body.registrationSession, now).catch(() => {});
    }
    return result(details, status, headers);
  };
  const form = preview ? readPreviewRegistration(body, day) : readRegistration(body, day);
  if (form.field) return failure({ code: 'INVALID_DATA', field: form.field }, 400);
  if (body.honeypot != null && (typeof body.honeypot !== 'string' || body.honeypot.length > 200)) {
    return result({ code: 'INVALID_DATA' }, 400);
  }
  if (body.honeypot?.trim()) return result({ success: true, queueNumber: '999' });
  if (!secret) return failure({ code: 'SERVER_ERROR', error: 'Hệ thống đang được cấu hình. Vui lòng thử lại sau.' }, 503);
  const retryAfter = await registrationRetryAfter(db, request.headers.get('CF-Connecting-IP')?.trim() || null, secret, now)
    .catch(() => null);
  if (retryAfter === null) return failure({ code: 'SERVER_ERROR', error: 'Hệ thống đang bận. Vui lòng thử lại sau.' }, 503);
  if (retryAfter) {
    const error = form.details.tt25.language === 'en'
      ? 'Too many requests from this network. Please try again in a few minutes.'
      : 'Có quá nhiều yêu cầu từ mạng này. Vui lòng thử lại sau ít phút.';
    return result({ code: 'RATE_LIMITED', error }, 429, { 'Retry-After': String(retryAfter) });
  }
  const [session, requestHash] = await Promise.all([
    hashRegistrationSession(body.registrationSession),
    preview ? hashRegistrationSession(`preview-request|${body.registrationSession}|${JSON.stringify(form)}`)
      : hashRegistrationRequest(form.payload, secret),
  ]);
  const { identityDocumentType, language } = form.details.tt25;
  const duplicateParams = [branch, now - identityCooldownMs, form.document, identityDocumentType];
  const id = crypto.randomUUID();
  let issued;
  try {
    issued = await db.batch([
      db.prepare(`
        with next_ticket as (${nextQueueNumberSql})
        insert into registrations (id, branch, queue_date, queue_number, demo_code, registered_at)
        select ?, ?, ?, number, ?, ? from next_ticket
        where number <= ?
          and exists (select 1 from preview_registration_sessions where token_hash = ? and branch = ? and expires_at > ?)
          and not exists (select 1 from preview_registration_submissions where token_hash = ?)
          and (${latestSameDocument}) is null
      `).bind(branch, day, id, branch, day, form.document, now, dailyQueueLimit, session, branch, now, session, ...duplicateParams),
      db.prepare('insert into preview_registration_edits (registration_id, details) select id, ? from registrations where id = ?')
        .bind(JSON.stringify(form.details), id),
      db.prepare(`
        insert into preview_registration_submissions (token_hash, registration_id, request_hash)
        select ?, id, ? from registrations where id = ?
      `).bind(session, requestHash, id),
      db.prepare(`
        select r.queue_date, r.queue_number, r.demo_code, s.expires_at, p.request_hash,
          case when p.registration_id is null then (${latestSameDocument}) end as duplicate_at
        from preview_registration_sessions s
        left join preview_registration_submissions p using (token_hash)
        left join registrations r on r.id = p.registration_id
        where s.token_hash = ? and s.branch = ?
      `).bind(...duplicateParams, session, branch),
    ]);
  } catch {
    return failure({ code: 'SERVER_ERROR', error: 'Không thể cấp số thứ tự. Vui lòng thử lại.' }, 500);
  }
  const [write, , , receipt] = issued;
  const row = receipt.results[0];
  const scanAgain = 'Phiên đăng ký đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại phòng khám.';
  if (!row) return result({ code: 'REGISTRATION_SESSION_INVALID', error: scanAgain }, 403);
  if (now >= row.expires_at) return failure({ code: 'REGISTRATION_SESSION_EXPIRED', error: scanAgain }, 403);
  if (row.duplicate_at !== null) {
    const remainingSeconds = Math.ceil((row.duplicate_at + identityCooldownMs - now) / 1000);
    const minutes = Math.ceil(remainingSeconds / 60);
    const passport = identityDocumentType === 'passport';
    const error = language === 'en'
      ? `This ${passport ? 'passport' : 'Citizen ID'} was recently registered at this branch. Please try again in ${minutes} min.`
      : `${passport ? 'Hộ chiếu' : 'CCCD'} này vừa được đăng ký tại chi nhánh này. Vui lòng thử lại sau ${minutes} phút.`;
    return failure({ code: 'IDENTITY_DOCUMENT_COOLDOWN', error }, 429, { 'Retry-After': String(remainingSeconds) });
  }
  if (row.queue_number === null) return failure({ code: 'QUEUE_LIMIT_REACHED', error: 'Chi nhánh đã cấp hết số thứ tự trong ngày.' }, 409);
  if (row.request_hash !== requestHash && !(preview && row.request_hash === null && row.demo_code === form.document)) {
    return result({ code: 'REGISTRATION_SESSION_INVALID', error: scanAgain }, 403);
  }
  if (write.meta.changes > 0) notify(branch, id);
  const queueNumber = String(row.queue_number);
  return result({ success: true, queueDate: row.queue_date, queueNumber: preview ? queueNumber : queueNumber.padStart(3, '0') },
    write.meta.changes > 0 ? 201 : 200);
}
