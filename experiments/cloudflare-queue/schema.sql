create table if not exists registrations (
  id text primary key,
  branch text not null check (branch in ('q1', 'q7')),
  queue_date text not null,
  queue_number integer not null check (queue_number > 0),
  demo_code text not null,
  registered_at integer not null,
  called_at integer,
  unique (branch, queue_date, queue_number)
) strict;

create index if not exists registrations_recent_code
  on registrations (branch, demo_code, registered_at);

create index if not exists registrations_waiting
  on registrations (branch, queue_date, queue_number) where called_at is null;
