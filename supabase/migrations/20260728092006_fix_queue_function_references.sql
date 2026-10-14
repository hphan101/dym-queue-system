-- Replace the two functions whose OUT parameter names overlap table columns.

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
  p_cooldown_seconds integer default 600
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
begin
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
  p_phone_number := regexp_replace(p_phone_number, '[^0-9]', '', 'g');
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
    or p_phone_number !~ '^0(3|5|7|8|9)[0-9]{8}$'
    or p_identity_document !~ '^([0-9]{12}|[A-Z][A-Z0-9]{6,12})$'
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

create or replace function public.recall_current_queue(p_branch_code text)
returns table (
  registration_id uuid,
  queue_number text,
  called_at timestamptz,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_display public.branch_display_state%rowtype;
  v_called_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into v_branch
  from public.branches
  where code = lower(trim(p_branch_code))
    and is_active;

  if not found or not public.can_access_branch(v_branch.id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  select *
  into v_display
  from public.branch_display_state
  where branch_id = v_branch.id
  for update;

  if not found or v_display.registration_id is null then
    return;
  end if;

  insert into public.queue_calls (
    branch_id,
    registration_id,
    call_kind,
    called_by,
    called_at
  )
  values (
    v_branch.id,
    v_display.registration_id,
    'recall',
    auth.uid(),
    v_called_at
  );

  update public.branch_display_state
  set called_at = v_called_at,
      revision = public.branch_display_state.revision + 1
  where branch_id = v_branch.id
  returning * into v_display;

  insert into public.audit_logs (
    branch_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_branch.id,
    auth.uid(),
    'queue.recalled',
    'registration',
    v_display.registration_id,
    jsonb_build_object('queue_number', v_display.queue_number)
  );

  return query
  select
    v_display.registration_id,
    lpad(v_display.queue_number::text, 4, '0'),
    v_called_at,
    v_display.revision;
end;
$$;
