create table public.roster_unavailability (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.medical_personnel(id) on delete cascade,
  unavailable_date date not null,
  start_minute integer not null,
  end_minute integer not null,
  constraint roster_unavailability_minutes check (
    (start_minute = 0 and end_minute = 1440)
    or (start_minute >= 360 and end_minute <= 1440 and start_minute < end_minute
      and start_minute % 15 = 0 and end_minute % 15 = 0)
  ),
  unique (personnel_id, unavailable_date, start_minute, end_minute)
);

create index roster_unavailability_date_idx on public.roster_unavailability (unavailable_date, id);
alter table public.roster_unavailability enable row level security;
revoke all on table public.roster_unavailability from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.roster_unavailability to authenticated;

create policy permission_read on public.roster_unavailability for select to authenticated
  using (public.has_permission('personnel') or public.has_permission('clinic') or public.has_permission('onsite'));
create policy permission_insert on public.roster_unavailability for insert to authenticated
  with check (public.has_permission('personnel', 'update'));
create policy permission_update on public.roster_unavailability for update to authenticated
  using (public.has_permission('personnel', 'update')) with check (public.has_permission('personnel', 'update'));
create policy permission_delete on public.roster_unavailability for delete to authenticated
  using (public.has_permission('personnel', 'update'));

create function public.require_roster_availability(person uuid, target_date date, target_start integer, target_end integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('roster-time:' || person::text || ':' || target_date::text, 0));
  if exists (
    select 1 from public.roster_unavailability u
    where u.personnel_id = person and u.unavailable_date = target_date
      and u.start_minute < target_end and target_start < u.end_minute
  ) then
    raise exception using errcode = '23P01', message = 'Nhân sự đã khai báo bận hoặc nghỉ trong khung giờ này.';
  end if;
end;
$$;

create function public.guard_roster_unavailability()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('roster-time:' || new.personnel_id::text || ':' || new.unavailable_date::text, 0));
  if exists (
    select 1
    from public.roster_assignments a
    join public.roster_schedules s on s.id = a.schedule_id
    where a.personnel_id = new.personnel_id and s.schedule_date = new.unavailable_date
      and coalesce(a.start_minute, case when a.shift_period = 'PM' then 720 else 0 end) < new.end_minute
      and new.start_minute < coalesce(a.end_minute, case when a.shift_period = 'AM' then 720 else 1440 end)
  ) then
    raise exception using errcode = '23P01', message = 'Khung giờ bận trùng với ca đã xếp. Vui lòng đổi ca trước khi lưu.';
  end if;
  return new;
end;
$$;

create trigger guard_roster_unavailability before insert or update on public.roster_unavailability
for each row execute function public.guard_roster_unavailability();

create or replace function public.guard_roster_assignment_time_overlap()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_date date;
  target_start integer;
  target_end integer;
begin
  select schedule_date into target_date from public.roster_schedules
  where id = new.schedule_id for share;
  target_start := coalesce(new.start_minute, case when new.shift_period = 'PM' then 720 else 0 end);
  target_end := coalesce(new.end_minute, case when new.shift_period = 'AM' then 720 else 1440 end);
  perform public.require_roster_availability(new.personnel_id, target_date, target_start, target_end);

  if exists (
    select 1 from public.roster_assignments a
    join public.roster_schedules s on s.id = a.schedule_id
    where a.id <> new.id and a.personnel_id = new.personnel_id and s.schedule_date = target_date
      and (new.start_minute is not null or a.start_minute is not null)
      and coalesce(a.start_minute, case when a.shift_period = 'PM' then 720 else 0 end) < target_end
      and target_start < coalesce(a.end_minute, case when a.shift_period = 'AM' then 720 else 1440 end)
  ) then
    raise exception using errcode = '23P01', message = 'Nhân sự đã được xếp trong khung giờ này.';
  end if;
  return new;
end;
$$;

create function public.guard_roster_schedule_availability()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  assignment record;
begin
  for assignment in
    select a.personnel_id,
      coalesce(a.start_minute, case when a.shift_period = 'PM' then 720 else 0 end) as starts,
      coalesce(a.end_minute, case when a.shift_period = 'AM' then 720 else 1440 end) as ends
    from public.roster_assignments a where a.schedule_id = old.id
    order by a.personnel_id
  loop
    perform public.require_roster_availability(assignment.personnel_id, new.schedule_date, assignment.starts, assignment.ends);
  end loop;
  return new;
end;
$$;

create trigger guard_roster_schedule_availability before update of schedule_date on public.roster_schedules
for each row when (old.schedule_date is distinct from new.schedule_date)
execute function public.guard_roster_schedule_availability();

revoke all on function public.require_roster_availability(uuid, date, integer, integer),
  public.guard_roster_unavailability(), public.guard_roster_schedule_availability()
from public, anon, authenticated, service_role;
