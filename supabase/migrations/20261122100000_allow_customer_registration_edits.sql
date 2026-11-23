create function public.edit_registration_with_session(
  p_session_hash text,
  p_branch_code text,
  p_changes jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_registration public.registrations%rowtype;
  v_details jsonb;
  v_original jsonb;
  v_field text;
  v_value text;
  v_min integer;
  v_max integer;
  v_reason text;
  v_company_required boolean;
begin
  select r.* into v_registration
  from public.registration_access_sessions s
  join public.registrations r on r.id = s.registration_id and r.branch_id = s.branch_id
  join public.branches b on b.id = s.branch_id
  where s.token_hash = p_session_hash and b.code = p_branch_code and b.is_active
  for update of r;

  if not found then
    raise exception using errcode = 'P0001', message = 'EDIT_SESSION_INVALID';
  end if;

  -- Start the edit window when the ticket was issued, even if the QR session expires first.
  if v_registration.registered_at + interval '10 minutes' <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'EDIT_SESSION_EXPIRED';
  end if;

  if v_registration.state <> 'active' or v_registration.first_called_at is not null
    or v_registration.tt25_data->>'printedConsent' = 'true'
    or v_registration.tt25_data->>'printedTT25' = 'true'
    or exists (select 1 from public.queue_calls where registration_id = v_registration.id)
  then
    raise exception using errcode = 'P0001', message = 'EDIT_LOCKED';
  end if;

  v_reason := coalesce(v_registration.tt25_data->>'checkupReason', '');
  v_company_required := v_reason ~* 'công ty|doanh nghiệp';
  v_original := jsonb_build_object(
    'fullName', v_registration.full_name,
    'phoneNumber', v_registration.phone_number,
    'email', coalesce(v_registration.tt25_data->>'email', ''),
    'province', v_registration.province,
    'ward', v_registration.ward,
    'addressDetail', v_registration.address_detail,
    'workplace', v_registration.company_name
  );
  v_details := v_original;

  if p_changes is not null then
    if jsonb_typeof(p_changes) <> 'object' or octet_length(p_changes::text) > 4096 then
      raise exception using errcode = 'P0001', message = 'INVALID_DATA';
    end if;

    for v_field in select jsonb_object_keys(p_changes) loop
      if not (v_original ? v_field) or jsonb_typeof(p_changes->v_field) <> 'string' then
        raise exception using errcode = 'P0001', message = 'INVALID_DATA';
      end if;

      v_value := trim(p_changes->>v_field);
      if v_field = 'phoneNumber' then
        if v_value !~ '^[0-9 ()+.-]*$' or (v_value <> '' and v_value !~ '[0-9]') then
          raise exception using errcode = 'P0001', message = 'INVALID_DATA', detail = v_field;
        end if;
        v_value := regexp_replace(v_value, '[^0-9]', '', 'g');
      end if;
      v_min := case v_field
        when 'fullName' then 2 when 'addressDetail' then 3 when 'province' then 1 when 'ward' then 1
        when 'workplace' then v_company_required::integer else 0 end;
      v_max := case v_field
        when 'fullName' then 100 when 'phoneNumber' then 10 when 'addressDetail' then 250 when 'workplace' then 150
        else 120 end;

      if char_length(v_value) not between v_min and v_max or v_value ~ '[[:cntrl:]]'
        or (v_field = 'phoneNumber' and not public.is_valid_registration_phone(v_value, v_registration.tt25_data))
        or (v_field = 'email' and v_value <> '' and v_value !~* $email$^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$email$)
      then
        raise exception using errcode = 'P0001', message = 'INVALID_DATA', detail = v_field;
      end if;

      v_details := jsonb_set(v_details, array[v_field], to_jsonb(v_value));
    end loop;

    if v_details is distinct from v_original then
      update public.registrations
      set full_name = v_details->>'fullName',
          phone_number = v_details->>'phoneNumber',
          province = v_details->>'province',
          ward = v_details->>'ward',
          address_detail = v_details->>'addressDetail',
          company_name = v_details->>'workplace',
          tt25_data = case when v_details->>'email' = v_original->>'email' then tt25_data
            else (coalesce(tt25_data, '{}'::jsonb) - 'email') || jsonb_strip_nulls(
              jsonb_build_object('email', nullif(v_details->>'email', ''))
            ) end,
          updated_at = clock_timestamp()
      where id = v_registration.id;

      insert into public.audit_logs (branch_id, action, entity_type, entity_id)
      values (v_registration.branch_id, 'registration.customer_details_updated', 'registration', v_registration.id);
    end if;
  end if;

  return jsonb_build_object('details', v_details, 'phoneRequired', v_reason !~* 'work permit',
    'companyRequired', v_company_required);
end;
$function$;

revoke all on function public.edit_registration_with_session(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.edit_registration_with_session(text, text, jsonb) to service_role;
