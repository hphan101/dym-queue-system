-- Bootstrap the first DYM administrator from an existing Supabase Auth user.
-- The SELECT from auth.users keeps local resets safe when this production-only
-- user does not exist in another environment.

insert into public.profiles (
  user_id,
  display_name,
  role,
  is_active
)
select
  id,
  'Quản trị DYM',
  'admin'::public.staff_role,
  true
from auth.users
where id = '7d12d57c-b6dc-49ee-9976-1e4f08ae454a'::uuid
on conflict (user_id)
do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_active = excluded.is_active;

insert into public.staff_branch_access (user_id, branch_id)
select
  u.id,
  b.id
from auth.users u
cross join public.branches b
where u.id = '7d12d57c-b6dc-49ee-9976-1e4f08ae454a'::uuid
on conflict (user_id, branch_id) do nothing;
