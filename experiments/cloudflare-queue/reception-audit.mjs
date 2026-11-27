// Run immediately after the audited write in the same D1 batch.
export function registrationAudit(db, action, now, actorId, subject) {
  return db.prepare(`
    insert into audit_logs (branch, actor_id, action, entity_type, entity_id, created_at)
    select branch, ?2, ?3, 'registration', id, ?4 from registrations
    where changes() = 1 and id = case when ?2 is not null then ?1 else (
      select registration_id from preview_registration_submissions where token_hash = ?1
    ) end
  `).bind(subject, actorId, action, now);
}
