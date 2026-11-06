alter table public.roster_schedules
  add column sales_person text not null default '' check (char_length(sales_person) <= 255),
  add column departure_address text not null default '' check (char_length(departure_address) <= 1000);
