create function public.prepare_roster_assignment_replacement()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_date date;
  replacement_rate bigint;
begin
  select p.fixed_cost into replacement_rate from public.medical_personnel p
  where p.id = new.personnel_id and p.is_active;
  if not found then
    raise exception using errcode = '22023', message = 'Chỉ có thể chọn nhân sự đang hoạt động.';
  end if;

  if new.start_minute is not null then
    new.day_rate_snapshot := replacement_rate;
    new.base_cost_snapshot := round(replacement_rate::numeric * (new.end_minute - new.start_minute) / 480);
  else
    new.base_cost_snapshot := replacement_rate;
    -- The existing overlap trigger handles timed shifts. Also check two legacy shifts on replacement.
    select s.schedule_date into target_date from public.roster_schedules s where s.id = new.schedule_id for share;
    perform public.require_roster_availability(new.personnel_id, target_date,
      case when new.shift_period = 'PM' then 720 else 0 end,
      case when new.shift_period = 'AM' then 720 else 1440 end);
    if exists (
      select 1 from public.roster_assignments a join public.roster_schedules s on s.id = a.schedule_id
      where a.id <> new.id and a.personnel_id = new.personnel_id and s.schedule_date = target_date
        and a.start_minute is null
        and (a.shift_period = new.shift_period or a.shift_period = 'FULL' or new.shift_period = 'FULL')
    ) then
      raise exception using errcode = '23P01', message = 'Nhân sự đã được xếp trong khung giờ này.';
    end if;
  end if;
  return new;
end;
$$;

create trigger prepare_roster_assignment_replacement before update of personnel_id on public.roster_assignments
for each row when (old.personnel_id is distinct from new.personnel_id)
execute function public.prepare_roster_assignment_replacement();

create function public.log_roster_assignment_replacement()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  insert into public.audit_logs (branch_id, actor_id, action, entity_type, entity_id, metadata)
  select b.id, actor, 'roster.assignment_replaced', 'roster_assignment', new.id,
    jsonb_build_object(
      'actor_name', coalesce(p.display_name, 'Hệ thống'),
      'from_id', old.personnel_id, 'from_name', o.full_name,
      'to_id', new.personnel_id, 'to_name', n.full_name,
      'before_cost', old.total_cost, 'after_cost', new.total_cost
    )
  from public.roster_schedules s
  join public.medical_personnel o on o.id = old.personnel_id
  join public.medical_personnel n on n.id = new.personnel_id
  left join public.branches b on b.code = s.branch_code
  left join public.profiles p on p.user_id = actor
  where s.id = new.schedule_id;
  return new;
end;
$$;

create trigger log_roster_assignment_replacement after update of personnel_id on public.roster_assignments
for each row when (old.personnel_id is distinct from new.personnel_id)
execute function public.log_roster_assignment_replacement();

create index audit_logs_roster_assignment_replacements_idx on public.audit_logs (entity_id, created_at desc, id desc)
where entity_type = 'roster_assignment' and action = 'roster.assignment_replaced';

create function public.get_roster_assignment_changes(p_assignment_id uuid)
returns table (id text, changed_at timestamptz, actor_name text, from_name text, to_name text)
language sql stable security definer set search_path = '' as $$
  select l.id::text, l.created_at, l.metadata->>'actor_name', l.metadata->>'from_name', l.metadata->>'to_name'
  from public.audit_logs l
  join public.branches b on l.branch_id = b.id
  join public.roster_assignments a on a.id = l.entity_id
  join public.roster_schedules s on s.id = a.schedule_id and s.branch_code = b.code
  where l.entity_id = p_assignment_id and l.entity_type = 'roster_assignment' and l.action = 'roster.assignment_replaced'
    and public.can_access_branch_code(s.branch_code)
    and public.has_permission(case when s.schedule_type = 'insite' then 'clinic' else 'onsite' end)
  order by l.created_at desc, l.id desc
  limit 50;
$$;

revoke all on function public.prepare_roster_assignment_replacement(), public.log_roster_assignment_replacement(),
  public.get_roster_assignment_changes(uuid) from public, anon, authenticated;
grant execute on function public.get_roster_assignment_changes(uuid) to authenticated;
