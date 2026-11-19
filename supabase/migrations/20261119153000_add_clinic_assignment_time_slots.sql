alter table public.roster_assignments
  add column start_minute integer,
  add column end_minute integer,
  add column day_rate_snapshot bigint,
  add constraint roster_assignments_time_slot_check check (
    (start_minute is null and end_minute is null and day_rate_snapshot is null)
    or (
      start_minute is not null and end_minute is not null and day_rate_snapshot is not null
      and start_minute >= 360 and end_minute <= 1440 and start_minute < end_minute
      and start_minute % 15 = 0 and end_minute % 15 = 0 and day_rate_snapshot >= 0
      and base_cost_snapshot = round(day_rate_snapshot::numeric * (end_minute - start_minute) / 480)
    )
  );

-- Check across branches and schedule types, including assignments hidden by RLS.
create function public.guard_roster_assignment_time_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_date date;
  target_start integer;
  target_end integer;
begin
  select schedule_date into target_date
  from public.roster_schedules where id = new.schedule_id;

  perform pg_advisory_xact_lock(
    hashtextextended('roster-time:' || new.personnel_id::text || ':' || target_date::text, 0)
  );

  target_start := coalesce(new.start_minute, case when new.shift_period = 'PM' then 720 else 0 end);
  target_end := coalesce(new.end_minute, case when new.shift_period = 'AM' then 720 else 1440 end);

  if exists (
    select 1
    from public.roster_assignments a
    join public.roster_schedules s on s.id = a.schedule_id
    where a.id <> new.id and a.personnel_id = new.personnel_id
      and s.schedule_date = target_date
      and (new.start_minute is not null or a.start_minute is not null)
      and coalesce(a.start_minute, case when a.shift_period = 'PM' then 720 else 0 end) < target_end
      and target_start < coalesce(a.end_minute, case when a.shift_period = 'AM' then 720 else 1440 end)
  ) then
    raise exception using errcode = '23P01', message = 'Nhân sự đã được xếp trong khung giờ này.';
  end if;

  return new;
end;
$$;

create trigger guard_roster_assignment_time_overlap
before insert or update of schedule_id, personnel_id, shift_period, start_minute, end_minute
on public.roster_assignments
for each row execute function public.guard_roster_assignment_time_overlap();
