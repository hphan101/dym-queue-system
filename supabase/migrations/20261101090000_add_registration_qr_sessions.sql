create table public.registration_access_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  branch_id uuid not null references public.branches(id) on delete cascade,
  expires_at timestamptz not null,
  registration_id uuid unique references public.registrations(id) on delete cascade,
  request_hash text check (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index registration_access_sessions_expiry_idx
  on public.registration_access_sessions(expires_at);

alter table public.registration_access_sessions enable row level security;
revoke all on public.registration_access_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.registration_access_sessions to service_role;

create or replace function public.issue_registration_with_session(
  p_session_hash text,
  p_request_hash text,
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
  v_session public.registration_access_sessions%rowtype;
  v_issued record;
begin
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'REGISTRATION_SESSION_INVALID';
  end if;
  select s.* into v_session
  from public.registration_access_sessions s
  where s.token_hash = p_session_hash
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'REGISTRATION_SESSION_INVALID';
  end if;

  if v_session.expires_at <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'REGISTRATION_SESSION_EXPIRED';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = v_session.branch_id and b.is_active
      and b.code = lower(trim(p_branch_code))
  ) then
    raise exception using errcode = '42501', message = 'REGISTRATION_SESSION_INVALID';
  end if;

  -- A retry after a lost response returns the receipt without issuing another number.
  if v_session.registration_id is not null then
    if v_session.request_hash is distinct from p_request_hash then
      raise exception using errcode = '42501', message = 'REGISTRATION_SESSION_USED';
    end if;
    return query select r.id, lpad(r.queue_number::text, 4, '0'), r.queue_date, r.registered_at
    from public.registrations r where r.id = v_session.registration_id;
    return;
  end if;

  select * into v_issued from public.issue_registration(
    p_branch_code, p_full_name, p_birth_date, p_gender, p_phone_number,
    p_identity_document, p_company_name, p_province, p_ward, p_address_detail,
    p_fingerprint, p_cooldown_seconds, p_tt25_data
  );

  update public.registration_access_sessions
  set registration_id = v_issued.registration_id, request_hash = p_request_hash
  where token_hash = p_session_hash;

  return query select v_issued.registration_id, v_issued.queue_number,
    v_issued.queue_date, v_issued.registered_at;
end;
$$;

revoke all on function public.issue_registration_with_session(
  text, text, text, text, date, text, text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.issue_registration_with_session(
  text, text, text, text, date, text, text, text, text, text, text, text, text, integer, jsonb
) to service_role;

-- Called at most once per minute by each active staff QR screen.
create or replace function public.purge_expired_registration_sessions()
returns void language sql security definer set search_path = '' as $$
  delete from public.registration_access_sessions
  where expires_at < now() - interval '1 day';
$$;
revoke all on function public.purge_expired_registration_sessions() from public, anon, authenticated;
grant execute on function public.purge_expired_registration_sessions() to service_role;
