create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

create index if not exists branch_display_state_registration_id_idx
  on public.branch_display_state (registration_id);

create index if not exists queue_calls_called_by_idx
  on public.queue_calls (called_by);

create index if not exists registration_access_sessions_branch_id_idx
  on public.registration_access_sessions (branch_id);

create index if not exists registrations_checked_in_by_idx
  on public.registrations (checked_in_by);

create index if not exists registrations_first_called_by_idx
  on public.registrations (first_called_by);

create index if not exists roster_assignments_room_id_idx
  on public.roster_assignments (room_id);

create index if not exists roster_daily_room_overrides_room_id_idx
  on public.roster_daily_room_overrides (room_id);

create index if not exists staff_branch_access_branch_id_idx
  on public.staff_branch_access (branch_id);
