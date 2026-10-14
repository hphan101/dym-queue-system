-- Qualify branch_display_state columns because the function's return columns
-- use the same names. Without aliases, PL/pgSQL treats registration_id as
-- ambiguous at runtime.
create or replace function public.return_called_queue_to_waiting(
  p_branch_code text,
  p_registration_id uuid
)
returns table (
  registration_id uuid,
  queue_number text,
  display_cleared boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_registration public.registrations%rowtype;
  v_today date;
  v_display_cleared boolean := false;
  v_action_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_registration_id is null then
    raise exception using errcode = '22004', message = 'REGISTRATION_ID_REQUIRED';
  end if;

  select b.*
  into v_branch
  from public.branches as b
  where b.code = lower(trim(p_branch_code))
    and b.is_active;

  if not found or not public.can_access_branch(v_branch.id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  v_today := (v_action_at at time zone v_branch.timezone)::date;

  select r.*
  into v_registration
  from public.registrations as r
  where r.id = p_registration_id
    and r.branch_id = v_branch.id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.state <> 'active' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_ACTIVE';
  end if;

  if v_registration.queue_date <> v_today then
    raise exception using errcode = 'P0001', message = 'ONLY_TODAY_ALLOWED';
  end if;

  if v_registration.first_called_at is null then
    raise exception using errcode = 'P0001', message = 'ALREADY_WAITING';
  end if;

  update public.registrations as registration
  set first_called_at = null,
      last_called_at = null,
      first_called_by = null
  where registration.id = v_registration.id;

  update public.branch_display_state as display
  set registration_id = null,
      queue_date = null,
      queue_number = null,
      called_at = null,
      revision = display.revision + 1
  where display.branch_id = v_branch.id
    and display.registration_id = v_registration.id;

  v_display_cleared := found;

  insert into public.audit_logs (
    branch_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_branch.id,
    auth.uid(),
    'queue.returned_to_waiting',
    'registration',
    v_registration.id,
    jsonb_build_object(
      'queue_number', v_registration.queue_number,
      'queue_date', v_registration.queue_date,
      'previous_first_called_at', v_registration.first_called_at,
      'previous_last_called_at', v_registration.last_called_at,
      'display_cleared', v_display_cleared
    ),
    v_action_at
  );

  return query
  select
    v_registration.id,
    lpad(v_registration.queue_number::text, 4, '0'),
    v_display_cleared;
end;
$$;

revoke all on function public.return_called_queue_to_waiting(text, uuid)
  from public;
revoke all on function public.return_called_queue_to_waiting(text, uuid)
  from anon;
grant execute on function public.return_called_queue_to_waiting(text, uuid)
  to authenticated;
