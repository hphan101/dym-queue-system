alter policy profiles_self_or_admin_read on public.profiles
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('staff'))
  );
