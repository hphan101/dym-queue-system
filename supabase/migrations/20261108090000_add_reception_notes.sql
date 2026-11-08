-- Internal reception notes are separate from customer-submitted medical data.
alter table public.registrations
  add column reception_note text not null default ''
    check (char_length(reception_note) <= 500);

-- Keep anonymous/direct-column grants unchanged; notes are read through this branch-authorized RPC.
drop function public.get_registration_details(text, date);

create or replace function public.get_registration_details(
  p_branch_code text,
  p_queue_date date
)
returns table (
  id uuid,
  branch_id uuid,
  queue_date date,
  queue_number integer,
  registered_at timestamptz,
  full_name text,
  birth_date date,
  gender text,
  phone_number text,
  identity_document text,
  company_name text,
  province text,
  ward text,
  address_detail text,
  state public.registration_state,
  first_called_at timestamptz,
  last_called_at timestamptz,
  tt25_data jsonb,
  reception_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_queue_date is null then
    raise exception using errcode = '22004', message = 'QUEUE_DATE_REQUIRED';
  end if;

  select b.id
  into v_branch_id
  from public.branches b
  where b.code = lower(trim(p_branch_code))
    and b.is_active;

  if v_branch_id is null or not public.can_access_branch(v_branch_id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  return query
  select
    r.id,
    r.branch_id,
    r.queue_date,
    r.queue_number,
    r.registered_at,
    r.full_name,
    r.birth_date,
    r.gender,
    r.phone_number,
    r.identity_document,
    r.company_name,
    r.province,
    r.ward,
    r.address_detail,
    r.state,
    r.first_called_at,
    r.last_called_at,
    coalesce(r.tt25_data, '{}'::jsonb) as tt25_data,
    r.reception_note
  from public.registrations r
  where r.branch_id = v_branch_id
    and r.queue_date = p_queue_date
  order by r.queue_number asc;
end;
$$;

revoke all on function public.get_registration_details(text, date) from public, anon;
grant execute on function public.get_registration_details(text, date) to authenticated;

create function public.update_registration_reception_note(
  p_registration_id uuid,
  p_note text,
  p_expected_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if char_length(v_note) > 500 then
    raise exception using errcode = '22001', message = 'NOTE_TOO_LONG';
  end if;
  select * into v_reg from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;
  if not public.can_access_branch(v_reg.branch_id) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;
  -- Reject a stale edit while allowing retries after a lost success response.
  if v_reg.reception_note is distinct from p_expected_note
    and v_reg.reception_note is distinct from v_note then
    raise exception using errcode = '40001', message = 'NOTE_CHANGED';
  end if;
  if v_reg.reception_note is distinct from v_note then
    update public.registrations set reception_note = v_note, updated_at = now()
      where id = p_registration_id;
    insert into public.audit_logs(branch_id, actor_id, action, entity_type, entity_id)
      values(v_reg.branch_id, auth.uid(), 'registration.note_updated', 'registration', p_registration_id);
  end if;
  return v_note;
end;
$$;
revoke all on function public.update_registration_reception_note(uuid, text, text) from public, anon;
grant execute on function public.update_registration_reception_note(uuid, text, text) to authenticated;
