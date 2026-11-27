import { hashRegistrationSession, registrationFailureKind, verifyExpiredQrChallenge } from '../../supabase/functions/_shared/registrationAccess.ts';
import { registrationRetryAfter } from './registration-rate-limit.mjs';

async function recordFailure(db, branch, date, kind, sessionHash, now) {
  await db.prepare(`
    insert into registration_failure_counts (branch, queue_date, kind)
    select ?1, ?2, ?3
    where ?3 = 'qr_expired' or exists (
      select 1 from preview_registration_sessions where token_hash = ?4 and branch = ?1 and expires_at > ?5
    )
    on conflict (queue_date, branch, kind) do update set total = total + 1
  `).bind(branch, date, kind, sessionHash, now - 86_400_000).run();
}

export async function countSubmissionFailure(db, branch, day, code, sessionToken, now) {
  const kind = registrationFailureKind(code);
  if (!kind) return;
  await recordFailure(db, branch, day, kind, await hashRegistrationSession(sessionToken), now);
}

export async function countExpiredQrFailure(db, branch, day, challenge, secret, ip, now) {
  if (typeof challenge !== 'string' || await verifyExpiredQrChallenge(challenge, secret, now) !== branch) return;
  if (await registrationRetryAfter(db, ip, secret, now, 'expired-qr')) return;
  await recordFailure(db, branch, day, 'qr_expired', null, now);
}
