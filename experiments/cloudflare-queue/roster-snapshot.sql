-- Freeze roster writes and personnel-document uploads while taking the snapshot and copying its objects.
select jsonb_build_object(
  'medical_personnel', (select coalesce(jsonb_agg(to_jsonb(p) order by id), '[]') from public.medical_personnel p),
  'roster_unavailability', (select coalesce(jsonb_agg(to_jsonb(u) order by id), '[]') from public.roster_unavailability u),
  'clinic_rooms', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.clinic_rooms r),
  'roster_schedules', (select coalesce(jsonb_agg(to_jsonb(s) order by id), '[]') from public.roster_schedules s),
  'roster_assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by id), '[]') from public.roster_assignments a),
  'roster_daily_room_overrides', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.roster_daily_room_overrides r),
  'roster_position_templates', (select coalesce(jsonb_agg(to_jsonb(t) order by schedule_type), '[]') from public.roster_position_templates t),
  'roster_setup_links', (select coalesce(jsonb_agg(to_jsonb(l) order by setup_id, onsite_id), '[]') from public.roster_setup_links l),
  'personnel_documents', (select coalesce(jsonb_agg(to_jsonb(d) order by id), '[]') from public.personnel_documents d)
) as roster_snapshot;
