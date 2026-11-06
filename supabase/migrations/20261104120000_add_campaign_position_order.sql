alter table public.roster_schedules
  add column position_order_mode text not null default 'alphabetical'
  check (position_order_mode in ('alphabetical', 'manual'));
