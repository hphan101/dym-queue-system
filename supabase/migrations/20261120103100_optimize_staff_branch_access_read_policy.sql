alter policy staff_branch_access_self_or_admin_read on public.staff_branch_access
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('staff'))
  );
