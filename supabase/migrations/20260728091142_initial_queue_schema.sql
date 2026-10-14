-- DYM Queue System
-- Initial PostgreSQL schema for three branches, staff access, check-in,
-- atomic daily queue numbers, call history, and the public waiting display.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.staff_role as enum ('admin', 'receptionist');
create type public.registration_state as enum ('active', 'completed', 'cancelled');
create type public.queue_call_kind as enum ('next', 'recall');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('q1', 'q7', 'hn')),
  name text not null check (char_length(name) between 2 and 120),
  short_name text not null check (char_length(short_name) between 1 and 40),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 100),
  role public.staff_role not null default 'receptionist',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_branch_access (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create table public.daily_queue_counters (
  branch_id uuid not null references public.branches(id) on delete cascade,
  queue_date date not null,
  last_number integer not null check (last_number between 0 and 9999),
  updated_at timestamptz not null default now(),
  primary key (branch_id, queue_date)
);

create table public.registration_cooldowns (
  branch_id uuid not null references public.branches(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) between 32 and 128),
  last_registered_at timestamptz not null default now(),
  primary key (branch_id, fingerprint)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  queue_date date not null,
  queue_number integer not null check (queue_number between 1 and 9999),
  full_name text not null check (char_length(full_name) between 2 and 100),
  birth_date date not null check (birth_date >= date '1900-01-01'),
  gender text not null check (gender in ('Nam', 'Nữ')),
  phone_number text not null check (phone_number ~ '^0(3|5|7|8|9)[0-9]{8}$'),
  identity_document text not null
    check (identity_document ~ '^([0-9]{12}|[A-Za-z][A-Za-z0-9]{6,12})$'),
  company_name text not null default '' check (char_length(company_name) <= 150),
  province text not null check (char_length(province) between 1 and 120),
  ward text not null check (char_length(ward) between 1 and 120),
  address_detail text not null check (char_length(address_detail) between 3 and 250),
  state public.registration_state not null default 'active',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (branch_id, queue_date, queue_number),
  check (birth_date <= queue_date),
  check (
    (state = 'active' and completed_at is null and cancelled_at is null)
    or (state = 'completed' and completed_at is not null and cancelled_at is null)
    or (state = 'cancelled' and cancelled_at is not null and completed_at is null)
  )
);

create table public.queue_calls (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  call_kind public.queue_call_kind not null,
  called_by uuid not null references auth.users(id),
  called_at timestamptz not null default now()
);

-- This table intentionally contains no patient PII. It is safe for the public
-- waiting display to subscribe to it through Supabase Realtime.
create table public.branch_display_state (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  queue_date date,
  queue_number integer check (queue_number between 1 and 9999),
  called_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (
    (registration_id is null and queue_date is null and queue_number is null and called_at is null)
    or
    (registration_id is not null and queue_date is not null and queue_number is not null and called_at is not null)
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  branch_id uuid references public.branches(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index registrations_branch_date_registered_idx
  on public.registrations (branch_id, queue_date, registered_at);
create index registrations_active_queue_idx
  on public.registrations (branch_id, queue_date, queue_number)
  where state = 'active';
create index registrations_phone_idx
  on public.registrations (phone_number);
create index registrations_name_search_idx
  on public.registrations using gin (lower(full_name) gin_trgm_ops);
create index queue_calls_registration_called_idx
  on public.queue_calls (registration_id, called_at desc);
create index queue_calls_branch_called_idx
  on public.queue_calls (branch_id, called_at desc);
create index audit_logs_branch_created_idx
  on public.audit_logs (branch_id, created_at desc);
create index registration_cooldowns_last_seen_idx
  on public.registration_cooldowns (last_registered_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

create trigger branch_display_state_set_updated_at
before update on public.branch_display_state
for each row execute function public.set_updated_at();

insert into public.branches (code, name, short_name)
values
  ('q1', 'DYM mPlaza Quận 1', 'DYM Quận 1'),
  ('q7', 'DYM The Grace Quận 7', 'DYM Quận 7'),
  ('hn', 'DYM Epic Tower Cầu Giấy', 'DYM Hà Nội');

insert into public.branch_display_state (branch_id)
select id from public.branches;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
      and is_active
  );
$$;

create or replace function public.can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.profiles p
      join public.staff_branch_access a on a.user_id = p.user_id
      where p.user_id = auth.uid()
        and p.is_active
        and a.branch_id = target_branch_id
    );
$$;

-- Called only from the register Edge Function with the Supabase secret key.
-- Counter increment, cooldown check, and registration insert share one transaction.
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

  -- Serializes even the first request for a fingerprint, before a cooldown
  -- row exists, so two simultaneous submissions cannot both pass.
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

create or replace function public.check_in_registration(p_registration_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into v_registration
  from public.registrations
  where id = p_registration_id
  for update;

  if not found or not public.can_access_branch(v_registration.branch_id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  if v_registration.state <> 'active' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_ACTIVE';
  end if;

  if v_registration.checked_in_at is null then
    update public.registrations
    set checked_in_at = clock_timestamp(),
        checked_in_by = auth.uid()
    where id = p_registration_id
    returning * into v_registration;

    insert into public.audit_logs (
      branch_id,
      actor_id,
      action,
      entity_type,
      entity_id
    )
    values (
      v_registration.branch_id,
      auth.uid(),
      'registration.checked_in',
      'registration',
      v_registration.id
    );
  end if;

  return v_registration;
end;
$$;

create or replace function public.call_next_queue(p_branch_code text)
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
  v_today date;
  v_registration public.registrations%rowtype;
  v_called_at timestamptz := clock_timestamp();
  v_revision bigint;
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

  v_today := (v_called_at at time zone v_branch.timezone)::date;

  select r.*
  into v_registration
  from public.registrations r
  where r.branch_id = v_branch.id
    and r.queue_date = v_today
    and r.state = 'active'
    and r.checked_in_at is not null
    and not exists (
      select 1
      from public.queue_calls qc
      where qc.registration_id = r.id
    )
  order by r.queue_number
  for update skip locked
  limit 1;

  if not found then
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
    v_registration.id,
    'next',
    auth.uid(),
    v_called_at
  );

  insert into public.branch_display_state (
    branch_id,
    registration_id,
    queue_date,
    queue_number,
    called_at,
    revision
  )
  values (
    v_branch.id,
    v_registration.id,
    v_registration.queue_date,
    v_registration.queue_number,
    v_called_at,
    1
  )
  on conflict (branch_id)
  do update
    set registration_id = excluded.registration_id,
        queue_date = excluded.queue_date,
        queue_number = excluded.queue_number,
        called_at = excluded.called_at,
        revision = public.branch_display_state.revision + 1
  returning public.branch_display_state.revision into v_revision;

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
    'queue.called_next',
    'registration',
    v_registration.id,
    jsonb_build_object('queue_number', v_registration.queue_number)
  );

  return query
  select
    v_registration.id,
    lpad(v_registration.queue_number::text, 4, '0'),
    v_called_at,
    v_revision;
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

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_branch_access enable row level security;
alter table public.daily_queue_counters enable row level security;
alter table public.registration_cooldowns enable row level security;
alter table public.registrations enable row level security;
alter table public.queue_calls enable row level security;
alter table public.branch_display_state enable row level security;
alter table public.audit_logs enable row level security;

create policy branches_public_read
on public.branches
for select
to anon, authenticated
using (is_active);

create policy profiles_self_or_admin_read
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy staff_branch_access_self_or_admin_read
on public.staff_branch_access
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy registrations_staff_read
on public.registrations
for select
to authenticated
using (public.can_access_branch(branch_id));

create policy queue_calls_staff_read
on public.queue_calls
for select
to authenticated
using (public.can_access_branch(branch_id));

create policy branch_display_state_public_read
on public.branch_display_state
for select
to anon, authenticated
using (true);

create policy audit_logs_admin_read
on public.audit_logs
for select
to authenticated
using (public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.branches to anon, authenticated;
grant select on public.branch_display_state to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.staff_branch_access to authenticated;
grant select on public.registrations to authenticated;
grant select on public.queue_calls to authenticated;
grant select on public.audit_logs to authenticated;

revoke all on function public.issue_registration(
  text, text, date, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.issue_registration(
  text, text, date, text, text, text, text, text, text, text, text, integer
) to service_role;

revoke all on function public.check_in_registration(uuid) from public, anon;
revoke all on function public.call_next_queue(text) from public, anon;
revoke all on function public.recall_current_queue(text) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.check_in_registration(uuid) to authenticated;
grant execute on function public.call_next_queue(text) to authenticated;
grant execute on function public.recall_current_queue(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;

alter table public.branch_display_state replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'branch_display_state'
  ) then
    alter publication supabase_realtime add table public.branch_display_state;
  end if;
end;
$$;
