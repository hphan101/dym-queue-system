const windowMs = 10 * 60_000;

export async function registrationRetryAfter(db, ip, secret, now, scope = 'register') {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`preview-${scope}-ip|${ip ?? 'missing'}`));
  const fingerprint = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
  const limit = scope === 'expired-qr' ? 120 : ip ? 600 : 30;
  const allowed = await db.prepare(`
    insert into preview_registration_ip_limits (fingerprint, started_at, request_count) values (?1, ?2, 1)
    on conflict(fingerprint) do update set
      started_at = case when started_at <= ?3 then ?2 else started_at end,
      request_count = case when started_at <= ?3 then 1 else request_count + 1 end
    where started_at <= ?3 or request_count < ?4
    returning started_at
  `).bind(fingerprint, now, now - windowMs, limit).first();
  if (allowed) return 0;
  const blocked = await db.prepare('select started_at from preview_registration_ip_limits where fingerprint = ?')
    .bind(fingerprint).first();
  return Math.max(1, Math.min(windowMs / 1000, Math.ceil(((blocked?.started_at ?? now) + windowMs - now) / 1000)));
}
