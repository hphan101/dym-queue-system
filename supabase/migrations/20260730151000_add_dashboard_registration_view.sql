-- The dashboard needs a small subset of patient details. Keep direct table
-- column privileges restricted and expose only the fields required by reception.
create or replace function public.get_dashboard_registrations(
  p_branch_code text,
  p_queue_date date
)
returns table (
  id uuid,
  queue_date date,
  queue_number integer,
  registered_at timestamptz,
  full_name text,
  birth_date date,
  gender text,
  phone_number text,
  company_name text,
  first_called_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_queue_date is null then
    raise exception using errcode = '22004', message = 'QUEUE_DATE_REQUIRED';
  end if;

  select b.id
  into v_branch_id
  from public.branches b
  where b.code = lower(trim(p_branch_code))
    and b.is_active;

  if v_branch_id is null or not public.can_access_branch(v_branch_id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  return query
  select
    r.id,
    r.queue_date,
    r.queue_number,
    r.registered_at,
    r.full_name,
    r.birth_date,
    r.gender,
    r.phone_number,
    r.company_name,
    r.first_called_at
  from public.registrations r
  where r.branch_id = v_branch_id
    and r.queue_date = p_queue_date
    and r.state = 'active'
  order by r.queue_number asc;
end;
$$;

revoke all on function public.get_dashboard_registrations(text, date)
  from public;
revoke all on function public.get_dashboard_registrations(text, date)
  from anon;
grant execute on function public.get_dashboard_registrations(text, date)
  to authenticated;
