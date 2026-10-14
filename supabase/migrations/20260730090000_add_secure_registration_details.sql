-- Full registration details contain patient PII. Keep direct column access
-- restricted and expose the data only through this branch-authorized RPC.
create or replace function public.get_registration_details(
  p_branch_code text,
  p_queue_date date
)
returns table (
  id uuid,
  branch_id uuid,
  queue_date date,
  queue_number integer,
  registered_at timestamptz,
  full_name text,
  birth_date date,
  gender text,
  phone_number text,
  identity_document text,
  company_name text,
  province text,
  ward text,
  address_detail text,
  state public.registration_state,
  first_called_at timestamptz,
  last_called_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_result_count integer;
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

  select count(*)::integer
  into v_result_count
  from public.registrations r
  where r.branch_id = v_branch_id
    and r.queue_date = p_queue_date;

  insert into public.audit_logs (
    branch_id,
    actor_id,
    action,
    entity_type,
    metadata
  )
  values (
    v_branch_id,
    auth.uid(),
    'registration.details_viewed',
    'registration',
    jsonb_build_object(
      'queue_date', p_queue_date,
      'result_count', v_result_count
    )
  );

  return query
  select
    r.id,
    r.branch_id,
    r.queue_date,
    r.queue_number,
    r.registered_at,
    r.full_name,
    r.birth_date,
    r.gender,
    r.phone_number,
    r.identity_document,
    r.company_name,
    r.province,
    r.ward,
    r.address_detail,
    r.state,
    r.first_called_at,
    r.last_called_at
  from public.registrations r
  where r.branch_id = v_branch_id
    and r.queue_date = p_queue_date
  order by r.queue_number asc;
end;
$$;

revoke all on function public.get_registration_details(text, date) from public;
revoke all on function public.get_registration_details(text, date) from anon;
grant execute on function public.get_registration_details(text, date)
  to authenticated;
