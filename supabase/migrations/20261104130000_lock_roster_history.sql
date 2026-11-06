alter table public.profiles add column can_edit_roster_history boolean not null default false;

create function public.can_edit_roster_date(target_date date) returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
    or target_date >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    or exists (select 1 from public.profiles p where p.user_id = auth.uid()
      and p.is_active and p.role::text in ('admin','operator') and p.can_edit_roster_history);
$$;
revoke all on function public.can_edit_roster_date(date) from public;
grant execute on function public.can_edit_roster_date(date) to authenticated, service_role;

create function public.guard_roster_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_date date; new_date date;
begin
  if tg_table_name = 'roster_assignments' then
    if tg_op <> 'INSERT' then select schedule_date into old_date from public.roster_schedules where id=old.schedule_id; end if;
    if tg_op <> 'DELETE' then select schedule_date into new_date from public.roster_schedules where id=new.schedule_id; end if;
    -- A parent schedule's BEFORE DELETE trigger already checked cascaded deletes.
    if tg_op = 'DELETE' and old_date is null then return old; end if;
  else
    if tg_op <> 'INSERT' then old_date := old.schedule_date; end if;
    if tg_op <> 'DELETE' then new_date := new.schedule_date; end if;
  end if;
  if (old_date is not null and not public.can_edit_roster_date(old_date))
    or (new_date is not null and not public.can_edit_roster_date(new_date)) then
    raise exception 'ROSTER_HISTORY_LOCKED: Lịch từ hôm qua trở về trước đã khóa. Tài khoản chưa được cấp quyền sửa lịch cũ.' using errcode='42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_roster_history() from public;
create trigger guard_roster_schedule_history before insert or update or delete on public.roster_schedules
  for each row execute function public.guard_roster_history();
create trigger guard_roster_assignment_history before insert or update or delete on public.roster_assignments
  for each row execute function public.guard_roster_history();
create trigger guard_roster_override_history before insert or update or delete on public.roster_daily_room_overrides
  for each row execute function public.guard_roster_history();

-- Catalog changes must not rename/remove rooms used by locked historical records.
create function public.guard_historical_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare history_date date;
begin
  if tg_op = 'UPDATE' and new.room_name is not distinct from old.room_name
    and new.branch_code is not distinct from old.branch_code
    and new.is_active is not distinct from old.is_active
    and new.display_order is not distinct from old.display_order
    and (new.inactive_from is not distinct from old.inactive_from
      or new.inactive_from >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date) then return new; end if;
  select min(d.schedule_date) into history_date from (
    select s.schedule_date from public.roster_assignments a
      join public.roster_schedules s on s.id=a.schedule_id where a.room_id=old.id
    union all select o.schedule_date from public.roster_daily_room_overrides o where o.room_id=old.id
  ) d;
  if history_date is not null and not public.can_edit_roster_date(history_date) then
    raise exception 'ROSTER_HISTORY_LOCKED: Phòng đã được sử dụng trong lịch cũ, tài khoản chưa được cấp quyền sửa.' using errcode='42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_historical_room() from public;
create trigger guard_historical_room before update or delete on public.clinic_rooms
  for each row execute function public.guard_historical_room();
