create table public.registration_failure_counts (
  branch_id uuid not null references public.branches(id) on delete cascade,
  queue_date date not null,
  kind text not null check (kind in ('qr_expired', 'session_expired', 'duplicate_document', 'invalid_data', 'server_error')),
  total bigint not null default 1 check (total > 0),
  primary key (queue_date, branch_id, kind)
);

alter table public.registration_failure_counts enable row level security;
revoke all on public.registration_failure_counts from public, anon, authenticated, service_role;

create function public.record_registration_failure(p_branch_code text, p_kind text, p_session_hash text)
returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.registration_failure_counts as counts (branch_id, queue_date, kind)
  select b.id, (statement_timestamp() at time zone b.timezone)::date, p_kind
  from public.branches b
  where b.code = p_branch_code and b.is_active
    and p_kind in ('qr_expired', 'session_expired', 'duplicate_document', 'invalid_data', 'server_error')
    and (
      (p_kind = 'qr_expired' and p_session_hash is null)
      or (p_kind <> 'qr_expired' and exists (
        select 1 from public.registration_access_sessions s
        where s.token_hash = p_session_hash and s.branch_id = b.id
          and s.expires_at > statement_timestamp() - interval '1 day'
      ))
    )
  on conflict (queue_date, branch_id, kind) do update
    set total = counts.total + 1;
$$;

create function public.get_registration_failures(p_queue_date date, p_branch_code text default null)
returns table(kind text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('overview', 'view');
  if p_queue_date is null then
    raise exception 'INVALID_DATE' using errcode = '22023';
  end if;
  if p_branch_code is not null and not exists (
    select 1 from public.branches b
    where b.code = p_branch_code and b.is_active and public.can_access_branch(b.id)
  ) then
    raise exception 'ACCESS_DENIED' using errcode = '42501';
  end if;
  return query
    select f.kind, sum(f.total)::bigint
    from public.registration_failure_counts f
    join public.branches b on b.id = f.branch_id
    where f.queue_date = p_queue_date and b.is_active and public.can_access_branch(b.id)
      and (p_branch_code is null or b.code = p_branch_code)
    group by f.kind;
end;
$$;

revoke all on function public.record_registration_failure(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_registration_failure(text, text, text) to service_role;
revoke all on function public.get_registration_failures(date, text) from public, anon, authenticated, service_role;
grant execute on function public.get_registration_failures(date, text) to authenticated;
