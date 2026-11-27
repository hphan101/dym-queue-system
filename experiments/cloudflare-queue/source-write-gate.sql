-- Install ahead of the cutover. This script alone does not pause writes.
begin;

create schema if not exists dym_cutover;
revoke all on schema dym_cutover from public;

create or replace function dym_cutover.reject_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise sqlstate 'PT503' using message = 'CUTOVER_READ_ONLY';
end;
$$;

create or replace function dym_cutover.set_writes_paused(paused boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tables constant text[] := array[
    'audit_logs', 'branch_display_state', 'branches', 'clinic_rooms',
    'daily_queue_counters', 'medical_personnel', 'personnel_documents',
    'profiles', 'queue_calls', 'registration_access_sessions',
    'registration_cooldowns', 'registrations', 'roster_assignments',
    'roster_daily_room_overrides', 'roster_position_templates',
    'roster_schedules', 'roster_setup_links', 'roster_unavailability', 'staff_branch_access'
  ];
  quoted_tables text;
  relation text;
begin
  if paused is null then
    raise exception 'Specify true to pause or false to resume.';
  end if;
  select string_agg(format('public.%I', name), ', ' order by name)
    into quoted_tables from unnest(tables) as names(name);
  -- Either acquire every table lock or leave the existing write mode intact.
  execute 'lock table ' || quoted_tables || ' in share row exclusive mode nowait';
  foreach relation in array tables loop
    if paused then
      execute format('create or replace trigger dym_cutover_read_only before insert or update or delete or truncate on public.%I for each statement execute function dym_cutover.reject_write()', relation);
    else
      execute format('drop trigger if exists dym_cutover_read_only on public.%I', relation);
    end if;
  end loop;
end;
$$;

revoke all on function dym_cutover.reject_write(), dym_cutover.set_writes_paused(boolean) from public;

commit;
