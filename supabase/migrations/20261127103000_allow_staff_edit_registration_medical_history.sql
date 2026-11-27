create function public.update_registration_medical_history(
  p_registration_id uuid,
  p_history jsonb,
  p_expected_history jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration public.registrations%rowtype;
  saved jsonb;
  updated jsonb;
begin
  perform public.require_permission('registrations', 'update');

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select * into registration from public.registrations r
  where r.id = p_registration_id and public.can_access_branch(r.branch_id)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  if jsonb_typeof(p_history) is distinct from 'object' or octet_length(p_history::text) > 8192
    or jsonb_typeof(p_history->'personalHistory') is distinct from 'object'
    or p_history - array['familyHistory','personalHistory','personalOtherDetails','currentTreatment','pregnancyHistory'] <> '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'INVALID_MEDICAL_HISTORY';
  end if;

  if exists (select 1 from jsonb_each(p_history->'personalHistory') as answer(key,value)
       where key !~ '^([1-9]|1[0-9]|2[0-2])$' or jsonb_typeof(value) <> 'boolean')
    or exists (
      select 1 from (values
        ('familyHistory', 'hasDisease', 'diseaseDetails'),
        ('currentTreatment', 'isTreating', 'medications'),
        ('pregnancyHistory', 'hasHistory', 'details')
      ) as section(field, answer, notes)
      where (section.field <> 'pregnancyHistory' or p_history ? section.field)
        and (jsonb_typeof(p_history->section.field) is distinct from 'object'
          or coalesce(jsonb_typeof(p_history->section.field->section.answer), '') not in ('boolean', 'null')
          or jsonb_typeof(p_history->section.field->section.notes) is distinct from 'string'
          or (p_history->section.field) - array[section.answer, section.notes] <> '{}'::jsonb)
    )
    or jsonb_typeof(p_history->'personalOtherDetails') is distinct from 'string'
    or exists (select 1 from (values (p_history->>'personalOtherDetails'),
        (p_history->'familyHistory'->>'diseaseDetails'), (p_history->'currentTreatment'->>'medications'),
        (p_history->'pregnancyHistory'->>'details')) as notes(text)
      where char_length(text) > 300 or text ~ '[[:cntrl:]]')
  then
    raise exception using errcode = '22023', message = 'INVALID_MEDICAL_HISTORY';
  end if;

  saved := nullif(registration.tt25_data->'medicalHistory', 'null'::jsonb);
  updated := p_history || jsonb_build_object('commitmentAgreed', coalesce(saved->'commitmentAgreed' = 'true'::jsonb, false));
  if updated = saved then return saved; end if;
  if saved is distinct from nullif(p_expected_history, 'null'::jsonb) then
    raise exception using errcode = '40001', message = 'MEDICAL_HISTORY_CHANGED';
  end if;

  update public.registrations
  set tt25_data = coalesce(tt25_data, '{}'::jsonb) || jsonb_build_object('medicalHistory', updated),
      updated_at = clock_timestamp()
  where id = registration.id;
  insert into public.audit_logs (branch_id, actor_id, action, entity_type, entity_id)
  values (registration.branch_id, auth.uid(), 'registration.medical_history_updated', 'registration', registration.id);
  return updated;
end;
$$;

revoke all on function public.update_registration_medical_history(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_registration_medical_history(uuid, jsonb, jsonb) to authenticated;
