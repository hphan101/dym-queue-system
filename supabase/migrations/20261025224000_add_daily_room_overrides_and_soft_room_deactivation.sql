-- 1. Soft-deactivation date on clinic_rooms so historical schedules & cost reports retain room names
alter table public.clinic_rooms
  add column if not exists inactive_from date;

alter table public.clinic_rooms
  drop constraint if exists clinic_rooms_branch_code_room_name_key;

create unique index if not exists idx_clinic_rooms_branch_active_name_unique
  on public.clinic_rooms (branch_code, lower(room_name))
  where is_active = true and inactive_from is null;

-- 2. Per-day room overrides ("Chỉ hôm nay" added rooms OR "Ẩn phòng hôm nay" hidden fixed rooms)
create table if not exists public.roster_daily_room_overrides (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  branch_code text not null check (branch_code in ('q1', 'q7', 'hn')),
  override_type text not null check (override_type in ('add', 'hide')),
  room_id uuid references public.clinic_rooms(id) on delete cascade,
  custom_room_name text not null default '',
  display_order integer not null default 500,
  created_at timestamptz not null default now(),
  check (
    (override_type = 'hide' and room_id is not null)
    or (override_type = 'add' and length(trim(custom_room_name)) > 0)
  )
);

create unique index if not exists idx_roster_daily_overrides_hide_unique
  on public.roster_daily_room_overrides (schedule_date, branch_code, room_id)
  where override_type = 'hide';

create unique index if not exists idx_roster_daily_overrides_add_unique
  on public.roster_daily_room_overrides (schedule_date, branch_code, lower(custom_room_name))
  where override_type = 'add';

create index if not exists idx_roster_daily_overrides_date_branch
  on public.roster_daily_room_overrides (schedule_date, branch_code);

-- 3. Link temporary room assignments to roster_daily_room_overrides with ON DELETE CASCADE
alter table public.roster_assignments
  add column if not exists daily_override_id uuid references public.roster_daily_room_overrides(id) on delete cascade;

create index if not exists idx_roster_assignments_daily_override
  on public.roster_assignments (daily_override_id);

-- 4. Enable RLS and enforce branch-scoped roster management access
alter table public.roster_daily_room_overrides enable row level security;

drop policy if exists roster_daily_room_overrides_branch_access on public.roster_daily_room_overrides;
create policy roster_daily_room_overrides_branch_access
  on public.roster_daily_room_overrides
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

grant select, insert, update, delete on public.roster_daily_room_overrides to authenticated, service_role;
