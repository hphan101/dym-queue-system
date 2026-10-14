create table public.registration_ip_rate_limits (
  ip_hash text primary key check (char_length(ip_hash) = 64),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);

create index registration_ip_rate_limits_updated_idx
  on public.registration_ip_rate_limits (updated_at);

alter table public.registration_ip_rate_limits enable row level security;
revoke all on table public.registration_ip_rate_limits from anon, authenticated;

create or replace function public.consume_registration_ip_limit(
  p_ip_hash text,
  p_max_requests integer default 120,
  p_window_seconds integer default 600
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit public.registration_ip_rate_limits%rowtype;
begin
  p_ip_hash := lower(trim(p_ip_hash));
  p_max_requests := greatest(10, least(coalesce(p_max_requests, 120), 1000));
  p_window_seconds := greatest(
    60,
    least(coalesce(p_window_seconds, 600), 3600)
  );

  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_IP_HASH';
  end if;

  -- Serialize the first request too, before a counter row exists.
  perform pg_advisory_xact_lock(hashtextextended('ip:' || p_ip_hash, 0));

  -- Hashed identifiers that have not been seen for 30 days are no longer
  -- operationally useful and are removed automatically.
  delete from public.registration_ip_rate_limits
  where updated_at < v_now - interval '30 days';

  select *
  into v_limit
  from public.registration_ip_rate_limits
  where ip_hash = p_ip_hash
  for update;

  if not found then
    insert into public.registration_ip_rate_limits (
      ip_hash,
      window_started_at,
      request_count,
      updated_at
    )
    values (p_ip_hash, v_now, 1, v_now);

    return query select true, 0;
    return;
  end if;

  if v_limit.window_started_at <=
    v_now - make_interval(secs => p_window_seconds)
  then
    update public.registration_ip_rate_limits
    set window_started_at = v_now,
        request_count = 1,
        updated_at = v_now
    where ip_hash = p_ip_hash;

    return query select true, 0;
    return;
  end if;

  if v_limit.request_count >= p_max_requests then
    return query
    select
      false,
      greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_limit.window_started_at
              + make_interval(secs => p_window_seconds)
              - v_now
            )
          )
        )::integer
      );
    return;
  end if;

  update public.registration_ip_rate_limits
  set request_count = request_count + 1,
      updated_at = v_now
  where ip_hash = p_ip_hash;

  return query select true, 0;
end;
$$;

revoke all on function public.consume_registration_ip_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_registration_ip_limit(text, integer, integer)
to service_role;

-- Migration-level behavior check. It leaves no test row behind.
do $$
declare
  v_allowed boolean;
  v_retry integer;
  v_test_hash constant text :=
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
begin
  select result.allowed, result.retry_after_seconds
  into v_allowed, v_retry
  from public.consume_registration_ip_limit(v_test_hash, 10, 600) result;

  if not v_allowed or v_retry <> 0 then
    raise exception 'IP limiter rejected its first request';
  end if;

  update public.registration_ip_rate_limits
  set request_count = 10
  where ip_hash = v_test_hash;

  select result.allowed, result.retry_after_seconds
  into v_allowed, v_retry
  from public.consume_registration_ip_limit(v_test_hash, 10, 600) result;

  if v_allowed or v_retry <= 0 then
    raise exception 'IP limiter failed to block an exhausted window';
  end if;

  delete from public.registration_ip_rate_limits
  where ip_hash = v_test_hash;
end;
$$;
