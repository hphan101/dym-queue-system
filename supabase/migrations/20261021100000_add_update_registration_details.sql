-- 1. Add tt25_data JSONB column to registrations to persist all Circular 25
-- fields (occupation, workplaceProvince, workplaceWard, checkupReason,
-- ethnicity, bloodGroup, insuranceNumber, medicalHistory, targetPayment, etc.)
alter table public.registrations
  add column if not exists tt25_data jsonb not null default '{}'::jsonb;

-- 2. Allow the customer client (anon or authenticated) to attach the full TT25
-- form payload right after issue_registration returns the queue number.
create or replace function public.save_registration_tt25_data(
  p_branch_code text,
  p_queue_number integer,
  p_identity_document text,
  p_tt25_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_branch_code is null or p_queue_number is null or p_identity_document is null then
    return;
  end if;

  select b.id
  into v_branch_id
  from public.branches b
  where b.code = lower(trim(p_branch_code))
    and b.is_active;

  if v_branch_id is null then
    return;
  end if;

  update public.registrations r
  set
    tt25_data = coalesce(p_tt25_data, '{}'::jsonb),
    updated_at = now()
  where r.branch_id = v_branch_id
    and r.queue_number = p_queue_number
    and upper(trim(r.identity_document)) = upper(trim(p_identity_document))
    and r.registered_at >= now() - interval '24 hours';
end;
$$;

revoke all on function public.save_registration_tt25_data(
  text, integer, text, jsonb
) from public;

grant execute on function public.save_registration_tt25_data(
  text, integer, text, jsonb
) to anon, authenticated, service_role;

-- 3. Recreate get_registration_details to include tt25_data
drop function if exists public.get_registration_details(text, date);

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
  last_called_at timestamptz,
  tt25_data jsonb
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
    r.last_called_at,
    coalesce(r.tt25_data, '{}'::jsonb) as tt25_data
  from public.registrations r
  where r.branch_id = v_branch_id
    and r.queue_date = p_queue_date
  order by r.queue_number asc;
end;
$$;

revoke all on function public.get_registration_details(text, date) from public, anon;
grant execute on function public.get_registration_details(text, date) to authenticated;

-- 4. Allow authorized reception/admin staff to update a registration's personal,
-- address, and TT25 details when a customer makes a typo during self-registration.
drop function if exists public.update_registration_details(
  uuid, text, date, text, text, text, text, text, text, text
);

create or replace function public.update_registration_details(
  p_registration_id uuid,
  p_full_name text,
  p_birth_date date,
  p_gender text,
  p_phone_number text,
  p_identity_document text,
  p_company_name text,
  p_province text,
  p_ward text,
  p_address_detail text,
  p_tt25_data jsonb default null
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
    full_name = trim(p_full_name),
    birth_date = p_birth_date,
    gender = trim(p_gender),
    phone_number = regexp_replace(trim(p_phone_number), '[^0-9]', '', 'g'),
    identity_document = upper(trim(p_identity_document)),
    company_name = trim(coalesce(p_company_name, '')),
    province = trim(p_province),
    ward = trim(p_ward),
    address_detail = trim(p_address_detail),
    tt25_data = case
      when p_tt25_data is not null then coalesce(tt25_data, '{}'::jsonb) || p_tt25_data
      else tt25_data
    end,
    updated_at = now()
  where id = p_registration_id;

  insert into public.audit_logs (
    branch_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_reg.branch_id,
    auth.uid(),
    'registration.details_updated',
    'registration',
    p_registration_id,
    jsonb_build_object(
      'queue_number', v_reg.queue_number,
      'queue_date', v_reg.queue_date
    )
  );
end;
$$;

revoke all on function public.update_registration_details(
  uuid, text, date, text, text, text, text, text, text, text, jsonb
) from public, anon;

grant execute on function public.update_registration_details(
  uuid, text, date, text, text, text, text, text, text, text, jsonb
) to authenticated;
