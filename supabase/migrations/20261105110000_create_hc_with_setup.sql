-- Both sets of schedules, their event identities and links commit together.
create function public.create_onsite_with_setup(p_hc jsonb, p_setup jsonb)
returns setof public.roster_schedules language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; phase int; hc_group uuid := gen_random_uuid(); setup_group uuid := gen_random_uuid();
  hc_ids uuid[] := '{}'; created public.roster_schedules; company text; branch text;
begin
  if not public.can_manage_roster() then raise exception 'Không có quyền tạo lịch đoàn.' using errcode='42501'; end if;
  if jsonb_typeof(p_hc) is distinct from 'array' or jsonb_typeof(p_setup) is distinct from 'array' then
    raise exception 'Danh sách ngày khám và ngày set-up không hợp lệ.';
  end if;
  if jsonb_array_length(p_hc)=0 or jsonb_array_length(p_setup)=0 then
    raise exception 'Chọn ít nhất một ngày khám và một ngày set-up.';
  end if;
  company := btrim(p_hc->0->>'company_name'); branch := p_hc->0->>'branch_code';
  if coalesce(company,'')='' then raise exception 'Vui lòng nhập tên công ty.'; end if;
  for phase in 1..2 loop
    for item in select value from jsonb_array_elements(case when phase=1 then p_hc else p_setup end) loop
      if nullif(item->>'id','') is not null or (item->>'schedule_type') is distinct from (case when phase=1 then 'onsite_exam' else 'setup' end) then
        raise exception 'Chỉ tạo mới đoàn HC cùng lịch set-up.';
      end if;
      if phase=1 and ((item->>'branch_code') is distinct from branch or btrim(item->>'company_name') is distinct from company) then
        raise exception 'Các ngày khám phải cùng công ty và cơ sở ký hợp đồng.';
      end if;
      if coalesce(btrim(item->>'campaign_code'),'')='' then raise exception 'Vui lòng nhập mã đoàn.'; end if;
      insert into public.roster_schedules(
        schedule_type,branch_code,schedule_date,campaign_code,company_name,contact_person,company_address,notes,
        default_allowance,position_list,position_order_mode,sales_person,departure_address,campaign_group_id,setup_onsite_ids
      ) values (
        case when phase=1 then 'onsite_exam' else 'setup' end, branch, (item->>'schedule_date')::date,
        upper(btrim(item->>'campaign_code')), company, coalesce(item->>'contact_person',''),
        coalesce(item->>'company_address',''), coalesce(item->>'notes',''),
        greatest(0,coalesce((item->>'default_allowance')::bigint,0)),
        array(select jsonb_array_elements_text(coalesce(item->'position_list','[]'::jsonb))),
        coalesce(item->>'position_order_mode','alphabetical'), coalesce(item->>'sales_person',''),
        coalesce(item->>'departure_address',''), case when phase=1 then hc_group else setup_group end,
        case when phase=1 then '{}'::uuid[] else hc_ids end
      ) returning * into created;
      if phase=1 then hc_ids := array_append(hc_ids,created.id); end if;
      return next created;
    end loop;
  end loop;
end;
$$;
revoke all on function public.create_onsite_with_setup(jsonb,jsonb) from public;
grant execute on function public.create_onsite_with_setup(jsonb,jsonb) to authenticated,service_role;
