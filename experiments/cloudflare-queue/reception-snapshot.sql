-- Project the reception records and their journals from the same consistent snapshot.
select jsonb_build_object(
  'branches', (select coalesce(jsonb_agg(to_jsonb(b) order by code), '[]') from public.branches b),
  'registrations', (select coalesce(jsonb_agg(to_jsonb(r) order by branch_id, queue_date, queue_number), '[]') from public.registrations r),
  'daily_queue_counters', (select coalesce(jsonb_agg(to_jsonb(c) order by branch_id, queue_date), '[]') from public.daily_queue_counters c),
  'branch_display_state', (select coalesce(jsonb_agg(to_jsonb(d) order by branch_id), '[]') from public.branch_display_state d),
  'queue_calls', (select coalesce(jsonb_agg(to_jsonb(q) order by called_at, id), '[]') from public.queue_calls q),
  'audit_logs', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('id', id::text) order by created_at, id), '[]') from public.audit_logs a),
  'registration_access_sessions', (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.expires_at, s.token_hash), '[]')
    from public.registration_access_sessions s
    left join public.registrations r on r.id = s.registration_id
    where s.expires_at > now() or r.registered_at > now() - interval '10 minutes'
  )
) as reception_snapshot;
