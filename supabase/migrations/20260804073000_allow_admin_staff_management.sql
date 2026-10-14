-- Staff records are changed through an authenticated admin Edge Function.
-- These policies allow only active administrators to perform the required
-- database writes while keeping normal receptionist sessions read-only.

create policy profiles_admin_insert
on public.profiles
for insert
to authenticated
with check (public.is_admin());

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy staff_branch_access_admin_insert
on public.staff_branch_access
for insert
to authenticated
with check (public.is_admin());

create policy staff_branch_access_admin_delete
on public.staff_branch_access
for delete
to authenticated
using (public.is_admin());

create policy audit_logs_admin_insert
on public.audit_logs
for insert
to authenticated
with check (public.is_admin() and actor_id = auth.uid());

grant insert, update on public.profiles to authenticated;
grant insert, delete on public.staff_branch_access to authenticated;
grant insert on public.audit_logs to authenticated;
