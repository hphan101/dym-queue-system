-- Aggregate counts only; overview access does not expose patient records.
create function public.get_reception_trend(p_year integer, p_branch_code text default null)
returns table(queue_date date, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform public.require_permission('overview', 'view');
  if p_year is null or p_year not between 1900 and 2100 then
    raise exception 'INVALID_YEAR' using errcode = '22023';
  end if;
  if p_branch_code is not null and not exists (
    select 1 from public.branches b
    where b.code = p_branch_code and b.is_active and public.can_access_branch(b.id)
  ) then
    raise exception 'ACCESS_DENIED' using errcode = '42501';
  end if;
  return query
    select r.queue_date, count(*)
    from public.branches b
    join public.registrations r on r.branch_id = b.id
    where b.is_active and public.can_access_branch(b.id)
      and (p_branch_code is null or b.code = p_branch_code)
      and r.queue_date >= make_date(p_year, 1, 1)
      and r.queue_date < make_date(p_year + 1, 1, 1)
      and r.state <> 'cancelled'
    group by r.queue_date
    order by r.queue_date;
end;
$$;
revoke all on function public.get_reception_trend(integer, text) from public, anon;
grant execute on function public.get_reception_trend(integer, text) to authenticated;
