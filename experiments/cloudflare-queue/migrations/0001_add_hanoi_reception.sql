-- Staging only. Copy dependent rows before widening the two branch constraints.
create table _before_hanoi_registrations as select * from registrations;
create table _before_hanoi_preview_registration_sessions as select * from preview_registration_sessions;
create table _before_hanoi_display_state as select * from display_state;
create table _before_hanoi_preview_registration_submissions as select * from preview_registration_submissions;
create table _before_hanoi_preview_print_status as select * from preview_print_status;
create table _before_hanoi_preview_registration_edits as select * from preview_registration_edits;

drop trigger show_called_registration;
drop trigger clear_returned_registration;
drop trigger preview_lock_customer_edit_on_call;
drop trigger preview_lock_customer_edit_on_print;
drop trigger preview_lock_customer_edit_on_print_update;
drop table preview_registration_edits;
drop table preview_print_status;
drop table preview_registration_submissions;
drop table display_state;
drop table preview_registration_sessions;
drop table registrations;

create table registrations (
  id text primary key,
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  queue_number integer not null check (queue_number > 0),
  demo_code text not null,
  registered_at integer not null,
  called_at integer,
  unique (branch, queue_date, queue_number)
) strict;

create table preview_registration_sessions (
  token_hash text primary key,
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  expires_at integer not null
) strict;

create table display_state (
  branch text primary key,
  registration_id text references registrations (id),
  queue_date text,
  queue_number integer,
  called_at integer,
  revision integer not null
) strict;

create table preview_registration_submissions (
  token_hash text primary key references preview_registration_sessions (token_hash),
  registration_id text not null unique references registrations (id)
) strict;

create table preview_print_status (
  registration_id text primary key references registrations (id),
  consent integer not null default 0,
  tt25 integer not null default 0
) strict;

create table preview_registration_edits (
  registration_id text primary key references registrations (id),
  details text not null default '{}' check (json_valid(details)),
  locked integer not null default 0 check (locked in (0, 1))
) strict;

-- Restore with triggers absent so previously published TV revisions and edit locks survive.
insert into registrations select * from _before_hanoi_registrations;
insert into preview_registration_sessions select * from _before_hanoi_preview_registration_sessions;
insert into display_state select * from _before_hanoi_display_state;
insert into preview_registration_submissions select * from _before_hanoi_preview_registration_submissions;
insert into preview_print_status select * from _before_hanoi_preview_print_status;
insert into preview_registration_edits select * from _before_hanoi_preview_registration_edits;
drop table _before_hanoi_preview_registration_edits;
drop table _before_hanoi_preview_print_status;
drop table _before_hanoi_preview_registration_submissions;
drop table _before_hanoi_display_state;
drop table _before_hanoi_preview_registration_sessions;
drop table _before_hanoi_registrations;

create index registrations_recent_code
  on registrations (branch, demo_code, registered_at);

create index registrations_waiting
  on registrations (branch, queue_date, queue_number) where called_at is null;

create trigger show_called_registration
after update of called_at on registrations
when old.called_at is null and new.called_at is not null
begin
  insert into display_state (branch, registration_id, queue_date, queue_number, called_at, revision)
  values (new.branch, new.id, new.queue_date, new.queue_number, new.called_at, 1)
  on conflict (branch) do update set registration_id = new.id, queue_date = new.queue_date,
    queue_number = new.queue_number, called_at = new.called_at, revision = revision + 1;
end;

create trigger clear_returned_registration
after update of called_at on registrations
when old.called_at is not null and new.called_at is null
begin
  update display_state set registration_id = null, queue_number = null, called_at = null,
    revision = revision + 1 where registration_id = new.id;
end;

create trigger preview_lock_customer_edit_on_call
after update of called_at on registrations
when new.called_at is not null
begin
  insert into preview_registration_edits (registration_id, locked) values (new.id, 1)
  on conflict (registration_id) do update set locked = 1;
end;

create trigger preview_lock_customer_edit_on_print
after insert on preview_print_status
when new.consent or new.tt25
begin
  insert into preview_registration_edits (registration_id, locked) values (new.registration_id, 1)
  on conflict (registration_id) do update set locked = 1;
end;

create trigger preview_lock_customer_edit_on_print_update
after update on preview_print_status
when new.consent or new.tt25
begin
  insert into preview_registration_edits (registration_id, locked) values (new.registration_id, 1)
  on conflict (registration_id) do update set locked = 1;
end;
