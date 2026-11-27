alter table registrations
  add column state text not null default 'active' check (state in ('active', 'completed', 'cancelled'));

alter table registrations add column last_called_at integer;

update registrations
set last_called_at = coalesce((select called_at from display_state where registration_id = registrations.id), called_at)
where called_at is not null;

drop index registrations_waiting;
create index registrations_waiting
  on registrations (branch, queue_date, queue_number) where state = 'active' and called_at is null;

create table daily_queue_counters (
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  last_number integer not null check (last_number between 0 and 9999),
  primary key (branch, queue_date)
) strict;

insert into daily_queue_counters (branch, queue_date, last_number)
select branch, queue_date, max(queue_number) from registrations group by branch, queue_date;

create trigger keep_last_queue_number
after insert on registrations
begin
  insert into daily_queue_counters (branch, queue_date, last_number)
  values (new.branch, new.queue_date, new.queue_number)
  on conflict (branch, queue_date) do update set last_number = max(last_number, excluded.last_number);
end;

drop trigger clear_returned_registration;
create trigger clear_returned_registration
after update of called_at on registrations
when old.called_at is not null and new.called_at is null
begin
  update display_state set registration_id = null, queue_date = null, queue_number = null, called_at = null,
    revision = revision + 1 where registration_id = new.id;
end;
