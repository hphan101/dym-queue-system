-- Medical Roster, Insite Room Scheduling (D1/D7), Onsite Campaigns & Cost Management
-- Core Principle: All costs are snapshotted at assignment time; the dashboard only reads & aggregates.

-- 1. Medical Personnel Catalog (Doctors, Nurses, Collaborators / CTV)
create table if not exists public.medical_personnel (
  id uuid primary key default gen_random_uuid(),
  personnel_code text not null unique,
  full_name text not null,
  role_type text not null check (role_type in ('doctor', 'nurse', 'ctv')),
  phone_number text not null default '',
  email text not null default '',
  fixed_cost bigint not null default 0 check (fixed_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_medical_personnel_role_active
  on public.medical_personnel (role_type, is_active);

-- 2. Clinic Rooms Catalog per Branch (D1 = q1, D7 = q7)
create table if not exists public.clinic_rooms (
  id uuid primary key default gen_random_uuid(),
  branch_code text not null check (branch_code in ('q1', 'q7', 'hn')),
  room_name text not null,
  display_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_code, room_name)
);

create index if not exists idx_clinic_rooms_branch_order
  on public.clinic_rooms (branch_code, is_active, display_order);

-- 3. Roster Schedules (Insite Daily Branch Schedule OR Onsite / Blood Draw Campaign)
create table if not exists public.roster_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_type text not null check (schedule_type in ('insite', 'onsite_exam', 'blood_draw')),
  branch_code text not null check (branch_code in ('q1', 'q7', 'hn')),
  schedule_date date not null,
  campaign_code text,
  company_name text not null default '',
  contact_person text not null default '',
  company_address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_roster_schedules_insite_unique
  on public.roster_schedules (branch_code, schedule_date)
  where schedule_type = 'insite';

create index if not exists idx_roster_schedules_date_branch
  on public.roster_schedules (schedule_date, branch_code, schedule_type);

-- 4. Roster Assignments (Cost locked at assignment time)
create table if not exists public.roster_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.roster_schedules(id) on delete cascade,
  room_id uuid references public.clinic_rooms(id) on delete set null,
  position_label text not null default '',
  personnel_id uuid not null references public.medical_personnel(id) on delete restrict,
  shift_period text not null default 'FULL' check (shift_period in ('FULL', 'AM', 'PM')),
  base_cost_snapshot bigint not null default 0 check (base_cost_snapshot >= 0),
  allowance_cost bigint not null default 0 check (allowance_cost >= 0),
  total_cost bigint generated always as (base_cost_snapshot + allowance_cost) stored,
  note text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists idx_roster_assignments_schedule
  on public.roster_assignments (schedule_id, sort_order);

create index if not exists idx_roster_assignments_personnel
  on public.roster_assignments (personnel_id);

-- 5. Enable RLS and grant access to authenticated staff
alter table public.medical_personnel enable row level security;
alter table public.clinic_rooms enable row level security;
alter table public.roster_schedules enable row level security;
alter table public.roster_assignments enable row level security;

drop policy if exists medical_personnel_authenticated_all on public.medical_personnel;
create policy medical_personnel_authenticated_all
  on public.medical_personnel
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists clinic_rooms_authenticated_all on public.clinic_rooms;
create policy clinic_rooms_authenticated_all
  on public.clinic_rooms
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists roster_schedules_authenticated_all on public.roster_schedules;
create policy roster_schedules_authenticated_all
  on public.roster_schedules
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists roster_assignments_authenticated_all on public.roster_assignments;
create policy roster_assignments_authenticated_all
  on public.roster_assignments
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.medical_personnel to authenticated, service_role;
grant select, insert, update, delete on public.clinic_rooms to authenticated, service_role;
grant select, insert, update, delete on public.roster_schedules to authenticated, service_role;
grant select, insert, update, delete on public.roster_assignments to authenticated, service_role;

-- 6. Seed initial default rooms for D1 (q1) and D7 (q7) (can be freely added/edited/removed in UI)
insert into public.clinic_rooms (branch_code, room_name, display_order)
values
  ('q1', 'IMD 1 (C03)', 10),
  ('q1', 'IMD 2 (C04)', 20),
  ('q1', 'IMD 3 (C06)', 30),
  ('q1', 'IMD 4 (C07)', 40),
  ('q1', 'EYE 1 (B11)', 50),
  ('q1', 'ENT 1 (B04)', 60),
  ('q1', 'DENTAL 1 (C09)', 70),
  ('q1', 'GYN 1 (A11)', 80),
  ('q1', 'Xray 1 (B05)', 90),
  ('q7', 'IMD 1', 10),
  ('q7', 'IMD 2', 20),
  ('q7', 'EYE 1', 30),
  ('q7', 'ENT 1', 40),
  ('q7', 'DENTAL 1', 50),
  ('q7', 'GYN 1', 60),
  ('q7', 'Xray 1', 70)
on conflict (branch_code, room_name) do nothing;
