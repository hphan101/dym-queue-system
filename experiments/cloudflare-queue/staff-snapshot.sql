-- Project staff metadata from one PostgreSQL snapshot. Auth credentials and sessions are excluded.
select jsonb_build_object(
  'branches', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'is_active', is_active) order by code), '[]'::jsonb)
    from public.branches
  ),
  'profiles', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'display_name', display_name, 'role', role, 'permissions', permissions,
      'is_active', is_active, 'can_edit_roster_history', can_edit_roster_history, 'created_at', created_at
    ) order by user_id), '[]'::jsonb)
    from public.profiles
  ),
  'staff_branch_access', (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'branch_id', branch_id) order by user_id, branch_id), '[]'::jsonb)
    from public.staff_branch_access
  ),
  'auth_users', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until, 'last_sign_in_at', u.last_sign_in_at
    ) order by u.id), '[]'::jsonb)
    from auth.users u
    join public.profiles p on p.user_id = u.id
  )
) as staff_snapshot;
