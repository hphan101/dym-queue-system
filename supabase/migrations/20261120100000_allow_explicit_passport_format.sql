create function public.is_valid_registration_identity_document(p_document text, p_tt25_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_tt25_data->>'identityDocumentType'
    when 'passport' then char_length(btrim(p_document)) between 1 and 100
    when 'cccd' then p_document ~ '^[0-9]{12}$'
    else p_document ~ '^([0-9]{12}|[A-Za-z][A-Za-z0-9]{6,12})$'
  end;
$$;

alter table public.registrations
  drop constraint registrations_identity_document_check,
  add constraint registrations_identity_document_check
    check (public.is_valid_registration_identity_document(identity_document, tt25_data));

create or replace function public.issue_registration(
  p_branch_code text,
  p_full_name text,
  p_birth_date date,
  p_gender text,
  p_phone_number text,
  p_identity_document text,
  p_company_name text,
  p_province text,
  p_ward text,
  p_address_detail text,
  p_fingerprint text,
  p_cooldown_seconds integer default 600,
  p_tt25_data jsonb default '{}'::jsonb
)
returns table (
  registration_id uuid,
  queue_number text,
  queue_date date,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_today date;
  v_now timestamptz := clock_timestamp();
  v_last_registered_at timestamptz;
  v_next_number integer;
  v_registration public.registrations%rowtype;
  v_clean_tt25 jsonb := coalesce(p_tt25_data, '{}'::jsonb);
begin
  if octet_length(v_clean_tt25::text) > 8192 then
    raise exception using errcode = '22001', message = 'PAYLOAD_TOO_LARGE';
  end if;

  select *
  into v_branch
  from public.branches
  where code = lower(trim(p_branch_code))
    and is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVALID_BRANCH';
  end if;

  v_today := (v_now at time zone v_branch.timezone)::date;
  p_full_name := trim(p_full_name);
  p_phone_number := regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g');
  p_identity_document := upper(trim(p_identity_document));
  p_company_name := trim(coalesce(p_company_name, ''));
  p_province := trim(p_province);
  p_ward := trim(p_ward);
  p_address_detail := trim(p_address_detail);
  p_fingerprint := trim(p_fingerprint);
  p_cooldown_seconds := greatest(60, least(coalesce(p_cooldown_seconds, 600), 21600));

  if char_length(p_full_name) not between 2 and 100
    or p_birth_date < date '1900-01-01'
    or p_birth_date > v_today
    or p_gender not in ('Nam', 'Nữ')
    or not public.is_valid_registration_phone(p_phone_number, v_clean_tt25)
    or not public.is_valid_registration_identity_document(p_identity_document, v_clean_tt25)
    or char_length(p_company_name) > 150
    or char_length(p_province) not between 1 and 120
    or char_length(p_ward) not between 1 and 120
    or char_length(p_address_detail) not between 3 and 250
    or char_length(p_fingerprint) not between 32 and 128
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DATA';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_branch.id::text || ':' || p_fingerprint, 0)
  );

  select last_registered_at
  into v_last_registered_at
  from public.registration_cooldowns
  where branch_id = v_branch.id
    and fingerprint = p_fingerprint
  for update;

  if found
    and v_last_registered_at > v_now - make_interval(secs => p_cooldown_seconds)
  then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  insert into public.daily_queue_counters (
    branch_id,
    queue_date,
    last_number,
    updated_at
  )
  values (v_branch.id, v_today, 0, v_now)
  on conflict on constraint daily_queue_counters_pkey do nothing;

  select c.last_number
  into v_next_number
  from public.daily_queue_counters c
  where c.branch_id = v_branch.id
    and c.queue_date = v_today
  for update;

  if v_next_number >= 9999 then
    raise exception using errcode = 'P0001', message = 'QUEUE_LIMIT_REACHED';
  end if;

  v_next_number := v_next_number + 1;

  update public.daily_queue_counters as c
  set last_number = v_next_number,
      updated_at = v_now
  where c.branch_id = v_branch.id
    and c.queue_date = v_today;

  insert into public.registrations (
    branch_id,
    queue_date,
    queue_number,
    full_name,
    birth_date,
    gender,
    phone_number,
    identity_document,
    company_name,
    province,
    ward,
    address_detail,
    tt25_data,
    registered_at
  )
  values (
    v_branch.id,
    v_today,
    v_next_number,
    p_full_name,
    p_birth_date,
    p_gender,
    p_phone_number,
    p_identity_document,
    p_company_name,
    p_province,
    p_ward,
    p_address_detail,
    v_clean_tt25,
    v_now
  )
  returning * into v_registration;

  insert into public.registration_cooldowns (
    branch_id,
    fingerprint,
    last_registered_at
  )
  values (v_branch.id, p_fingerprint, v_now)
  on conflict (branch_id, fingerprint)
  do update set last_registered_at = excluded.last_registered_at;

  return query
  select
    v_registration.id,
    lpad(v_registration.queue_number::text, 4, '0'),
    v_registration.queue_date,
    v_registration.registered_at;
end;
$$;

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
    or not public.is_valid_registration_phone(
      v_clean_phone, coalesce(v_reg.tt25_data, '{}'::jsonb) || coalesce(p_tt25_data, '{}'::jsonb)
    )
    or not public.is_valid_registration_identity_document(
      v_clean_doc, coalesce(v_reg.tt25_data, '{}'::jsonb) || coalesce(p_tt25_data, '{}'::jsonb)
    )
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
