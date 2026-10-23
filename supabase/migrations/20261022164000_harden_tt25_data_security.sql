-- Harden save_registration_tt25_data:
-- 1. Enforce a strict 8 KB JSON payload limit inside PostgreSQL.
-- 2. Revoke direct execution from anon/authenticated browser roles so only the
--    rate-limited Edge Function (service_role) can write initial tt25_data.
create or replace function public.save_registration_tt25_data(
  p_branch_code text,
  p_queue_number integer,
  p_identity_document text,
  p_tt25_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if p_branch_code is null or p_queue_number is null or p_identity_document is null then
    return;
  end if;

  if octet_length(coalesce(p_tt25_data, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22001', message = 'PAYLOAD_TOO_LARGE';
  end if;

  select b.id
  into v_branch_id
  from public.branches b
  where b.code = lower(trim(p_branch_code))
    and b.is_active;

  if v_branch_id is null then
    return;
  end if;

  update public.registrations r
  set
    tt25_data = coalesce(p_tt25_data, '{}'::jsonb),
    updated_at = now()
  where r.branch_id = v_branch_id
    and r.queue_number = p_queue_number
    and upper(trim(r.identity_document)) = upper(trim(p_identity_document))
    and r.registered_at >= now() - interval '24 hours';
end;
$$;

revoke all on function public.save_registration_tt25_data(
  text, integer, text, jsonb
) from public, anon, authenticated;

grant execute on function public.save_registration_tt25_data(
  text, integer, text, jsonb
) to service_role;
