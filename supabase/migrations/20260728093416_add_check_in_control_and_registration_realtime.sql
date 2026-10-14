create or replace function public.set_registration_check_in(
  p_registration_id uuid,
  p_checked_in boolean
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_was_checked_in boolean;
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

  v_was_checked_in := v_registration.checked_in_at is not null;

  if not p_checked_in and exists (
    select 1
    from public.queue_calls
    where registration_id = p_registration_id
  ) then
    raise exception using errcode = 'P0001', message = 'CHECK_IN_LOCKED_AFTER_CALL';
  end if;

  if v_was_checked_in <> p_checked_in then
    update public.registrations
    set checked_in_at = case when p_checked_in then clock_timestamp() else null end,
        checked_in_by = case when p_checked_in then auth.uid() else null end
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
      case
        when p_checked_in then 'registration.checked_in'
        else 'registration.check_in_reverted'
      end,
      'registration',
      v_registration.id
    );
  end if;

  return v_registration;
end;
$$;

revoke all on function public.set_registration_check_in(uuid, boolean)
from public, anon;
grant execute on function public.set_registration_check_in(uuid, boolean)
to authenticated;

alter table public.registrations replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'registrations'
  ) then
    alter publication supabase_realtime add table public.registrations;
  end if;
end;
$$;
