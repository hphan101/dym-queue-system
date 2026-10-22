-- 1. Allow reception/admin staff to update print status (Consent & TT25)
-- directly in registrations.tt25_data so all reception computers see it in real time.
create or replace function public.update_registration_print_status(
  p_registration_id uuid,
  p_printed_consent boolean default null,
  p_printed_tt25 boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into v_reg
  from public.registrations r
  where r.id = p_registration_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  if not public.can_access_branch(v_reg.branch_id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  update public.registrations
  set
    tt25_data = coalesce(tt25_data, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'printedConsent', p_printed_consent,
        'printedTT25', p_printed_tt25
      )
    ),
    updated_at = now()
  where id = p_registration_id;
end;
$$;

revoke all on function public.update_registration_print_status(
  uuid, boolean, boolean
) from public, anon;

grant execute on function public.update_registration_print_status(
  uuid, boolean, boolean
) to authenticated;

-- 2. Include tt25_data in get_dashboard_registrations so QueueTable on /admin
-- also receives real-time synced print status from the server.
drop function if exists public.get_dashboard_registrations(text, date);

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
  first_called_at timestamptz,
  tt25_data jsonb
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
    r.first_called_at,
    coalesce(r.tt25_data, '{}'::jsonb) as tt25_data
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
