-- Per-account permissions. NULL preserves the existing role defaults.
create function public.valid_staff_permissions(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare caps jsonb := '{"reception":["view","update"],"registrations":["view","create","update","delete"],"registration_qr":["view"],"printing":["view"],"overview":["view"],"clinic":["view","create","update","delete"],"onsite":["view","create","update","delete"],"personnel":["view","create","update","delete"],"personnel_documents":["view","create","delete"],"settlement":["view"],"export":["view"],"staff":["view","create","update","delete"]}'::jsonb; entry record; item record;
begin
 if value is null then return true; end if;
 if jsonb_typeof(value)<>'object' or (select count(*) from jsonb_object_keys(value)) <> (select count(*) from jsonb_object_keys(caps)) then return false; end if;
 for entry in select * from jsonb_each(value) loop
  if not caps ? entry.key or jsonb_typeof(entry.value)<>'object' then return false; end if;
  for item in select * from jsonb_each(entry.value) loop
   if not (caps->entry.key) ? item.key or jsonb_typeof(item.value)<>'boolean' then return false; end if;
   if item.key<>'view' and item.value='true'::jsonb and coalesce(entry.value->'view','false'::jsonb)<>'true'::jsonb then return false; end if;
  end loop;
 end loop;
 return true;
end; $$;
alter table public.profiles add column permissions jsonb check (public.valid_staff_permissions(permissions));
create function public.has_permission(module_key text, action_key text default 'view') returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select (coalesce(p.permissions, '{"admin":{"reception":{"view":true,"update":true},"registrations":{"view":true,"create":true,"update":true,"delete":true},"registration_qr":{"view":true},"printing":{"view":true},"overview":{"view":true},"clinic":{"view":true,"create":true,"update":true,"delete":true},"onsite":{"view":true,"create":true,"update":true,"delete":true},"personnel":{"view":true,"create":true,"update":true,"delete":true},"personnel_documents":{"view":true,"create":true,"delete":true},"settlement":{"view":true},"export":{"view":true},"staff":{"view":true,"create":true,"update":true,"delete":true}},"operator":{"reception":{"view":true,"update":true},"registrations":{"view":true,"create":true,"update":true,"delete":false},"registration_qr":{"view":true},"printing":{"view":true},"overview":{"view":true},"clinic":{"view":true,"create":true,"update":true,"delete":true},"onsite":{"view":true,"create":true,"update":true,"delete":true},"personnel":{"view":false,"create":false,"update":false,"delete":false},"personnel_documents":{"view":false,"create":false,"delete":false},"settlement":{"view":true},"export":{"view":true},"staff":{"view":false,"create":false,"update":false,"delete":false}},"receptionist":{"reception":{"view":true,"update":true},"registrations":{"view":true,"create":true,"update":true,"delete":false},"registration_qr":{"view":true},"printing":{"view":true},"overview":{"view":false},"clinic":{"view":false,"create":false,"update":false,"delete":false},"onsite":{"view":false,"create":false,"update":false,"delete":false},"personnel":{"view":false,"create":false,"update":false,"delete":false},"personnel_documents":{"view":false,"create":false,"delete":false},"settlement":{"view":false},"export":{"view":true},"staff":{"view":false,"create":false,"update":false,"delete":false}}}'::jsonb -> p.role::text) #> array[module_key,action_key]) = 'true'::jsonb from public.profiles p where p.user_id=auth.uid() and p.is_active),false);
$$;
revoke all on function public.has_permission(text,text) from public;
grant execute on function public.has_permission(text,text) to authenticated,service_role;
create function public.require_permission(module_key text, action_key text default 'view') returns void
language plpgsql security definer set search_path='' as $$ begin
 if module_key='registrations' and action_key='view' and public.has_permission('reception') and public.has_permission('printing') then return; end if;
 if coalesce(auth.role(),'') <> 'service_role' and not public.has_permission(module_key,action_key) then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
end; $$;
revoke all on function public.require_permission(text,text) from public;
grant execute on function public.require_permission(text,text) to authenticated,service_role;
create or replace function public.can_manage_roster() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('overview') or public.has_permission('clinic') or public.has_permission('onsite') or public.has_permission('settlement') or public.has_permission('personnel');
$$;
create or replace function public.can_edit_roster_date(target_date date) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(auth.role(),'')='service_role' or target_date >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
 or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.is_active and p.can_edit_roster_history);
$$;
-- Old administrators with NULL overrides retain legacy access. Once a matrix is
-- saved, branch assignments apply independently of the role preset.
create or replace function public.can_access_branch(target_branch_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.is_active
   and ((p.permissions is null and p.role::text='admin') or exists(select 1 from public.staff_branch_access a where a.user_id=p.user_id and a.branch_id=target_branch_id)));
$$;
create or replace function public.can_access_branch_code(target_branch_code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.branches b where b.code=target_branch_code and public.can_access_branch(b.id));
$$;
drop policy if exists profiles_self_or_admin_read on public.profiles;
create policy profiles_self_or_admin_read on public.profiles for select to authenticated using (user_id=auth.uid() or public.has_permission('staff'));
drop policy if exists staff_branch_access_self_or_admin_read on public.staff_branch_access;
create policy staff_branch_access_self_or_admin_read on public.staff_branch_access for select to authenticated using (user_id=auth.uid() or public.has_permission('staff'));
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.has_permission('staff'));
-- Reads needed for assignment lookups and operational summaries remain available
-- through their parent module; catalog writes require their own explicit permission.
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='medical_personnel' loop execute format('drop policy %I on public.medical_personnel',p.policyname); end loop; end $$;
create policy permission_read on public.medical_personnel for select to authenticated using (public.has_permission('personnel') or public.can_manage_roster());
create policy permission_insert on public.medical_personnel for insert to authenticated with check (public.has_permission('personnel','create'));
create policy permission_update on public.medical_personnel for update to authenticated using (public.has_permission('personnel','update')) with check (public.has_permission('personnel','update'));
create policy permission_delete on public.medical_personnel for delete to authenticated using (public.has_permission('personnel','delete'));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='clinic_rooms' loop execute format('drop policy %I on public.clinic_rooms',p.policyname); end loop; end $$;
create policy permission_read on public.clinic_rooms for select to authenticated using (public.can_manage_roster() and public.can_access_branch_code(branch_code));
create policy permission_insert on public.clinic_rooms for insert to authenticated with check (public.has_permission('clinic','create') and public.can_access_branch_code(branch_code));
create policy permission_update on public.clinic_rooms for update to authenticated using (public.has_permission('clinic','update') and public.can_access_branch_code(branch_code)) with check (public.has_permission('clinic','update') and public.can_access_branch_code(branch_code));
create policy permission_delete on public.clinic_rooms for delete to authenticated using (public.has_permission('clinic','delete') and public.can_access_branch_code(branch_code));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='roster_schedules' loop execute format('drop policy %I on public.roster_schedules',p.policyname); end loop; end $$;
create policy permission_read on public.roster_schedules for select to authenticated using (public.can_manage_roster() and public.can_access_branch_code(branch_code));
create policy permission_insert on public.roster_schedules for insert to authenticated with check (public.has_permission(case when schedule_type='insite' then 'clinic' else 'onsite' end,'create') and public.can_access_branch_code(branch_code));
create policy permission_update on public.roster_schedules for update to authenticated using (public.has_permission(case when schedule_type='insite' then 'clinic' else 'onsite' end,'update') and public.can_access_branch_code(branch_code)) with check (public.has_permission(case when schedule_type='insite' then 'clinic' else 'onsite' end,'update') and public.can_access_branch_code(branch_code));
create policy permission_delete on public.roster_schedules for delete to authenticated using (public.has_permission(case when schedule_type='insite' then 'clinic' else 'onsite' end,'delete') and public.can_access_branch_code(branch_code));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='roster_assignments' loop execute format('drop policy %I on public.roster_assignments',p.policyname); end loop; end $$;
create policy permission_read on public.roster_assignments for select to authenticated using (public.can_manage_roster() and exists(select 1 from public.roster_schedules s where s.id=schedule_id and public.can_access_branch_code(s.branch_code)));
create policy permission_insert on public.roster_assignments for insert to authenticated with check (exists(select 1 from public.roster_schedules s where s.id=schedule_id and public.has_permission(case when s.schedule_type='insite' then 'clinic' else 'onsite' end,'create') and public.can_access_branch_code(s.branch_code)));
create policy permission_update on public.roster_assignments for update to authenticated using (exists(select 1 from public.roster_schedules s where s.id=schedule_id and public.has_permission(case when s.schedule_type='insite' then 'clinic' else 'onsite' end,'update') and public.can_access_branch_code(s.branch_code))) with check (exists(select 1 from public.roster_schedules s where s.id=schedule_id and public.has_permission(case when s.schedule_type='insite' then 'clinic' else 'onsite' end,'update') and public.can_access_branch_code(s.branch_code)));
create policy permission_delete on public.roster_assignments for delete to authenticated using (exists(select 1 from public.roster_schedules s where s.id=schedule_id and public.has_permission(case when s.schedule_type='insite' then 'clinic' else 'onsite' end,'delete') and public.can_access_branch_code(s.branch_code)));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='roster_daily_room_overrides' loop execute format('drop policy %I on public.roster_daily_room_overrides',p.policyname); end loop; end $$;
create policy permission_read on public.roster_daily_room_overrides for select to authenticated using (public.can_manage_roster() and public.can_access_branch_code(branch_code));
create policy permission_insert on public.roster_daily_room_overrides for insert to authenticated with check (public.has_permission('clinic','create') and public.can_access_branch_code(branch_code));
create policy permission_update on public.roster_daily_room_overrides for update to authenticated using (public.has_permission('clinic','update') and public.can_access_branch_code(branch_code)) with check (public.has_permission('clinic','update') and public.can_access_branch_code(branch_code));
create policy permission_delete on public.roster_daily_room_overrides for delete to authenticated using (public.has_permission('clinic','delete') and public.can_access_branch_code(branch_code));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='roster_position_templates' loop execute format('drop policy %I on public.roster_position_templates',p.policyname); end loop; end $$;
create policy permission_read on public.roster_position_templates for select to authenticated using (public.has_permission('onsite'));
create policy permission_insert on public.roster_position_templates for insert to authenticated with check (public.has_permission('onsite','create'));
create policy permission_update on public.roster_position_templates for update to authenticated using (public.has_permission('onsite','update')) with check (public.has_permission('onsite','update'));
create policy permission_delete on public.roster_position_templates for delete to authenticated using (public.has_permission('onsite','delete'));
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='personnel_documents' loop execute format('drop policy %I on public.personnel_documents',p.policyname); end loop; end $$;
create policy permission_read on public.personnel_documents for select to authenticated using (public.has_permission('personnel_documents'));
create policy permission_insert on public.personnel_documents for insert to authenticated with check (public.has_permission('personnel_documents','create'));
create policy permission_delete on public.personnel_documents for delete to authenticated using (public.has_permission('personnel_documents','delete'));

-- Trigger checks also protect SECURITY DEFINER routines, which bypass RLS.
create function public.guard_staff_module_permission() returns trigger language plpgsql security definer set search_path='' as $$
declare module_key text; action_key text; sid uuid; stype text; target_branch text;
begin
 if coalesce(auth.role(),'')='service_role' then if tg_op='DELETE' then return old; else return new; end if; end if;
 action_key:=case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
 module_key:=tg_argv[0];
 if module_key='schedule' then
  if tg_table_name='roster_schedules' then
   stype:=case when tg_op='DELETE' then old.schedule_type else new.schedule_type end;
   if tg_op='UPDATE' then perform public.require_permission(case when old.schedule_type='insite' then 'clinic' else 'onsite' end,action_key); end if;
  else
   sid:=case when tg_op='DELETE' then old.schedule_id else new.schedule_id end;
   select schedule_type into stype from public.roster_schedules where id=sid;
   if tg_op='DELETE' and stype is null then return old; end if;
   if tg_op='UPDATE' and old.schedule_id is distinct from new.schedule_id then
    select schedule_type into stype from public.roster_schedules where id=old.schedule_id;
    perform public.require_permission(case when stype='insite' then 'clinic' else 'onsite' end,action_key);
    select schedule_type into stype from public.roster_schedules where id=new.schedule_id;
   end if;
  end if;
  module_key:=case when stype='insite' then 'clinic' else 'onsite' end;
 end if;
 perform public.require_permission(module_key,action_key);
 if tg_op<>'DELETE' then
  target_branch:=to_jsonb(new)->>'branch_code';
  if tg_table_name='roster_assignments' then select branch_code into target_branch from public.roster_schedules where id=new.schedule_id; end if;
  if target_branch is not null and not public.can_access_branch_code(target_branch) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 end if;
 if tg_op<>'INSERT' then
  target_branch:=to_jsonb(old)->>'branch_code';
  if tg_table_name='roster_assignments' then select branch_code into target_branch from public.roster_schedules where id=old.schedule_id; end if;
  if target_branch is not null and not public.can_access_branch_code(target_branch) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function public.guard_staff_module_permission() from public;
create trigger guard_module_permission before insert or update or delete on public.medical_personnel for each row execute function public.guard_staff_module_permission('personnel');
create trigger guard_module_permission before insert or update or delete on public.clinic_rooms for each row execute function public.guard_staff_module_permission('clinic');
create trigger guard_module_permission before insert or update or delete on public.roster_position_templates for each row execute function public.guard_staff_module_permission('onsite');
create trigger guard_module_permission before insert or update or delete on public.personnel_documents for each row execute function public.guard_staff_module_permission('personnel_documents');
create trigger guard_module_permission before insert or update or delete on public.roster_schedules for each row execute function public.guard_staff_module_permission('schedule');
create trigger guard_module_permission before insert or update or delete on public.roster_assignments for each row execute function public.guard_staff_module_permission('schedule');
create trigger guard_module_permission before insert or update or delete on public.roster_daily_room_overrides for each row execute function public.guard_staff_module_permission('clinic');
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_dashboard_registrations' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC get_dashboard_registrations'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''reception'',''view'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_registration_details' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC get_registration_details'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''registrations'',''view'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_registration_details' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC update_registration_details'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''registrations'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_registration_reception_note' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC update_registration_reception_note'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''registrations'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_registration_tt25_data' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC save_registration_tt25_data'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''registrations'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_registration_print_status' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC update_registration_print_status'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''printing'',''view'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='call_next_queue' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC call_next_queue'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''reception'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='recall_current_queue' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC recall_current_queue'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''reception'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='return_called_queue_to_waiting' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC return_called_queue_to_waiting'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''reception'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_in_registration' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC check_in_registration'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''reception'',''update'');'); end loop; end $$;
do $$ declare f record; definition text; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_onsite_with_setup' loop definition:=pg_get_functiondef(f.oid); if definition !~* E'\n[Bb][Ee][Gg][Ii][Nn]' then raise exception 'Cannot guard RPC create_onsite_with_setup'; end if; execute regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn]',E'\nBEGIN\n  perform public.require_permission(''onsite'',''create'');'); end loop; end $$;

drop policy if exists registrations_staff_read on public.registrations;
create policy registrations_staff_read on public.registrations for select to authenticated using (public.can_access_branch(branch_id) and (public.has_permission('registrations') or public.has_permission('reception')));
-- Existing direct delete access is kept branch-scoped and now uses the matrix.
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='registrations' and cmd='DELETE' loop execute format('drop policy %I on public.registrations',p.policyname); end loop; end $$;
create policy registrations_permission_delete on public.registrations for delete to authenticated using (public.can_access_branch(branch_id) and public.has_permission('registrations','delete'));
drop policy if exists queue_calls_staff_read on public.queue_calls;
create policy queue_calls_staff_read on public.queue_calls for select to authenticated using (public.can_access_branch(branch_id) and public.has_permission('reception'));
do $$ declare p record; check_expr text; use_expr text; action_key text; begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'personnel_scan_%' loop
  action_key:=case p.cmd when 'SELECT' then 'view' when 'INSERT' then 'create' else 'delete' end;
  use_expr:=replace(p.qual,'is_admin()',format('has_permission(''personnel_documents'',%L)',action_key));
  check_expr:=replace(p.with_check,'is_admin()',format('has_permission(''personnel_documents'',%L)',action_key));
  execute format('alter policy %I on storage.objects %s %s',p.policyname,case when use_expr is null then '' else 'using ('||use_expr||')' end,case when check_expr is null then '' else 'with check ('||check_expr||')' end);
 end loop;
end $$;
