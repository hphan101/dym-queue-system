create index registrations_document_branch_registered_idx
  on public.registrations (branch_id, identity_document, registered_at desc);

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
  v_legacy_document_type text;
  v_document_type text;
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

  v_legacy_document_type := case when p_identity_document ~ '^[0-9]{12}$' then 'cccd' else 'passport' end;
  v_document_type := case
    when v_clean_tt25->>'identityDocumentType' = 'passport' then 'passport'
    else v_legacy_document_type
  end;

  perform pg_advisory_xact_lock(
    hashtextextended('registration-document:' || v_branch.id::text || ':' || v_document_type || ':' || p_identity_document, 0)
  );

  v_now := clock_timestamp();
  v_today := (v_now at time zone v_branch.timezone)::date;
  select r.registered_at
  into v_last_registered_at
  from public.registrations r
  where r.branch_id = v_branch.id
    and r.identity_document = p_identity_document
    and (case when r.tt25_data->>'identityDocumentType' = 'passport' then 'passport' else v_legacy_document_type end) = v_document_type
    and r.registered_at > v_now - interval '1 hour'
  order by r.registered_at desc
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_DOCUMENT_COOLDOWN',
      detail = ceil(extract(epoch from v_last_registered_at + interval '1 hour' - v_now))::text,
      hint = v_document_type;
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

  return query
  select
    v_registration.id,
    lpad(v_registration.queue_number::text, 4, '0'),
    v_registration.queue_date,
    v_registration.registered_at;
end;
$$;
