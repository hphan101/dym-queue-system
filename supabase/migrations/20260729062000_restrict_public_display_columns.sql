-- Public screens only need branch metadata and the current queue number.
-- Internal registration identifiers remain available to authenticated staff.
revoke select on table public.branches from anon;
grant select (
  id,
  code,
  name,
  short_name,
  timezone,
  is_active
) on table public.branches to anon;

revoke select on table public.branch_display_state from anon;
grant select (
  branch_id,
  queue_date,
  queue_number,
  called_at,
  revision,
  updated_at
) on table public.branch_display_state to anon;

do $$
begin
  if has_column_privilege(
    'anon',
    'public.branch_display_state',
    'registration_id',
    'select'
  ) then
    raise exception 'Public role can still read registration_id';
  end if;
end;
$$;
