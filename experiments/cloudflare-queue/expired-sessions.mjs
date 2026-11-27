import { STAFF_LOGIN_BUCKET_MS } from './staff.mjs';

const dayMs = 24 * 60 * 60_000;

export function purgeExpiredPreviewSessions(db, scheduledAt) {
  const registrationCutoff = scheduledAt - dayMs;
  return db.batch([
    // Remove receipt links before their sessions. Registration rows have their own lifecycle.
    db.prepare(`
      delete from preview_registration_submissions where token_hash in (
        select token_hash from preview_registration_sessions where expires_at < ?
      )
    `).bind(registrationCutoff),
    db.prepare('delete from preview_registration_sessions where expires_at < ?').bind(registrationCutoff),
    db.prepare('delete from preview_managed_staff_sessions where expires_at <= ?').bind(scheduledAt),
    db.prepare('delete from preview_staff_sessions where expires_at <= ?').bind(scheduledAt),
    db.prepare('delete from preview_staff_login_limits where bucket < ?').bind(Math.floor(registrationCutoff / STAFF_LOGIN_BUCKET_MS)),
    db.prepare('delete from preview_registration_ip_limits where started_at < ?').bind(scheduledAt - 30 * dayMs),
  ]);
}
