-- 1. Enforce a table-level upper bound on registrations.tt25_data JSONB size
alter table public.registrations
  drop constraint if exists registrations_tt25_data_size_check;

alter table public.registrations
  add constraint registrations_tt25_data_size_check
  check (octet_length(tt25_data::text) <= 16384);

-- 2. Harden update_registration_details with explicit input and JSONB size validation
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
  v_clean_name text;
  v_clean_gender text;
  v_clean_phone text;
  v_clean_doc text;
  v_clean_company text;
  v_clean_province text;
  v_clean_ward text;
  v_clean_address text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_tt25_data is not null and octet_length(p_tt25_data::text) > 8192 then
    raise exception using errcode = '22001', message = 'PAYLOAD_TOO_LARGE';
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

  v_clean_name := trim(coalesce(p_full_name, ''));
  v_clean_gender := trim(coalesce(p_gender, ''));
  v_clean_phone := regexp_replace(trim(coalesce(p_phone_number, '')), '[^0-9]', '', 'g');
  v_clean_doc := upper(trim(coalesce(p_identity_document, '')));
  v_clean_company := trim(coalesce(p_company_name, ''));
  v_clean_province := trim(coalesce(p_province, ''));
  v_clean_ward := trim(coalesce(p_ward, ''));
  v_clean_address := trim(coalesce(p_address_detail, ''));

  if char_length(v_clean_name) not between 2 and 100
    or p_birth_date is null
    or p_birth_date < date '1900-01-01'
    or p_birth_date > v_reg.queue_date
    or v_clean_gender not in ('Nam', 'Nữ')
    or v_clean_phone !~ '^0(3|5|7|8|9)[0-9]{8}$'
    or v_clean_doc !~ '^([0-9]{12}|[A-Z][A-Z0-9]{6,12})$'
    or char_length(v_clean_company) > 150
    or char_length(v_clean_province) not between 1 and 120
    or char_length(v_clean_ward) not between 1 and 120
    or char_length(v_clean_address) not between 3 and 250
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DATA';
  end if;

  update public.registrations
  set
    full_name = v_clean_name,
    birth_date = p_birth_date,
    gender = v_clean_gender,
    phone_number = v_clean_phone,
    identity_document = v_clean_doc,
    company_name = v_clean_company,
    province = v_clean_province,
    ward = v_clean_ward,
    address_detail = v_clean_address,
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
