alter table public.registrations
  add column if not exists first_called_at timestamptz,
  add column if not exists last_called_at timestamptz,
  add column if not exists first_called_by uuid references auth.users(id) on delete set null;

-- Preserve call history if this migration is applied after the system has
-- already handled queue calls.
update public.registrations r
set first_called_at = history.first_called_at,
    last_called_at = history.last_called_at,
    first_called_by = history.first_called_by
from (
  select distinct on (registration_id)
    registration_id,
    min(called_at) over (partition by registration_id) as first_called_at,
    max(called_at) over (partition by registration_id) as last_called_at,
    first_value(called_by) over (
      partition by registration_id
      order by called_at
    ) as first_called_by
  from public.queue_calls
  order by registration_id, called_at
) history
where r.id = history.registration_id
  and r.first_called_at is null;

create index if not exists registrations_waiting_queue_idx
  on public.registrations (branch_id, queue_date, queue_number)
  where state = 'active' and first_called_at is null;

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
    and r.first_called_at is null
  order by r.queue_number
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.registrations
  set first_called_at = v_called_at,
      last_called_at = v_called_at,
      first_called_by = auth.uid()
  where id = v_registration.id;

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

  update public.registrations
  set last_called_at = v_called_at
  where id = v_display.registration_id;

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

drop function if exists public.check_in_registration(uuid);
drop function if exists public.set_registration_check_in(uuid, boolean);
