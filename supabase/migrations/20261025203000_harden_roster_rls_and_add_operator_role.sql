-- Security Audit Remediation:
-- 1. Add 'operator' (Vận hành) role to public.staff_role enum.
-- 2. Enforce least-privilege RLS policies on medical_personnel, clinic_rooms,
--    roster_schedules, and roster_assignments:
--    - 'admin': full access across all branches and medical_personnel catalog.
--    - 'operator': view/schedule access on clinic_rooms, roster_schedules, and
--      roster_assignments for assigned branches + read-only lookup on medical_personnel;
--      no write access to medical_personnel.
--    - 'receptionist' & deactivated staff: no access to roster or personnel tables.
-- 3. Revoke direct PostgREST write grants on profiles, staff_branch_access, and
--    audit_logs from authenticated so all staff mutations go through the
--    manage-staff Edge Function (service_role).

alter type public.staff_role add value if not exists 'operator';

create or replace function public.can_manage_roster()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_active
      and role::text in ('admin', 'operator')
  );
$$;

create or replace function public.can_access_branch_code(target_branch_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.profiles p
      join public.staff_branch_access a on a.user_id = p.user_id
      join public.branches b on b.id = a.branch_id
      where p.user_id = auth.uid()
        and p.is_active
        and b.code = target_branch_code
    );
$$;

revoke all on function public.can_manage_roster() from public;
grant execute on function public.can_manage_roster() to authenticated, service_role;

revoke all on function public.can_access_branch_code(text) from public;
grant execute on function public.can_access_branch_code(text) to authenticated, service_role;

-- Replace permissive USING (true) policies on medical roster tables
drop policy if exists medical_personnel_authenticated_all on public.medical_personnel;
drop policy if exists medical_personnel_select_roster_managers on public.medical_personnel;
drop policy if exists medical_personnel_admin_write on public.medical_personnel;

create policy medical_personnel_select_roster_managers
  on public.medical_personnel
  for select
  to authenticated
  using (public.can_manage_roster());

create policy medical_personnel_admin_insert
  on public.medical_personnel
  for insert
  to authenticated
  with check (public.is_admin());

create policy medical_personnel_admin_update
  on public.medical_personnel
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy medical_personnel_admin_delete
  on public.medical_personnel
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists clinic_rooms_authenticated_all on public.clinic_rooms;
drop policy if exists clinic_rooms_roster_branch_access on public.clinic_rooms;

create policy clinic_rooms_roster_branch_access
  on public.clinic_rooms
  for all
  to authenticated
  using (
    public.can_manage_roster()
    and public.can_access_branch_code(branch_code)
  )
  with check (
    public.can_manage_roster()
    and public.can_access_branch_code(branch_code)
  );

drop policy if exists roster_schedules_authenticated_all on public.roster_schedules;
drop policy if exists roster_schedules_roster_branch_access on public.roster_schedules;

create policy roster_schedules_roster_branch_access
  on public.roster_schedules
  for all
  to authenticated
  using (
    public.can_manage_roster()
    and public.can_access_branch_code(branch_code)
  )
  with check (
    public.can_manage_roster()
    and public.can_access_branch_code(branch_code)
  );

drop policy if exists roster_assignments_authenticated_all on public.roster_assignments;
drop policy if exists roster_assignments_roster_branch_access on public.roster_assignments;

create policy roster_assignments_roster_branch_access
  on public.roster_assignments
  for all
  to authenticated
  using (
    public.can_manage_roster()
    and exists (
      select 1
      from public.roster_schedules s
      where s.id = roster_assignments.schedule_id
        and public.can_access_branch_code(s.branch_code)
    )
  )
  with check (
    public.can_manage_roster()
    and exists (
      select 1
      from public.roster_schedules s
      where s.id = roster_assignments.schedule_id
        and public.can_access_branch_code(s.branch_code)
    )
  );

-- Revoke direct PostgREST write access on staff & audit tables from authenticated
-- (All writes are performed by supabase/functions/manage-staff via service_role)
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists staff_branch_access_admin_insert on public.staff_branch_access;
drop policy if exists staff_branch_access_admin_delete on public.staff_branch_access;
drop policy if exists audit_logs_admin_insert on public.audit_logs;

revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.staff_branch_access from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
