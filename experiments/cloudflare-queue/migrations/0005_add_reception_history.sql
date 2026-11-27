alter table registrations add column first_called_by text;
alter table registrations add column queue_actor_id text;

create table if not exists queue_calls (
  id text primary key default ('cf-' || lower(hex(randomblob(16)))),
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  registration_id text not null references registrations (id) on delete cascade,
  call_kind text not null check (call_kind in ('next', 'recall')),
  called_by text,
  called_at integer not null
) strict;

create index if not exists queue_calls_registration_time on queue_calls (registration_id, called_at);

create table if not exists audit_logs (
  id text primary key default ('cf-' || lower(hex(randomblob(16)))),
  branch text check (branch in ('q1', 'q7', 'hn')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata text not null default '{}' check (json_valid(metadata)),
  created_at integer not null
) strict;

create index if not exists audit_logs_entity_time on audit_logs (entity_type, entity_id, created_at);

create trigger if not exists log_registration_call
after update of last_called_at on registrations
when new.called_at is not null and new.last_called_at is not null
begin
  insert into queue_calls (branch, registration_id, call_kind, called_by, called_at)
  values (new.branch, new.id, case when old.called_at is null then 'next' else 'recall' end,
    new.queue_actor_id, new.last_called_at);
  insert into audit_logs (branch, actor_id, action, entity_type, entity_id, metadata, created_at)
  values (new.branch, new.queue_actor_id, case when old.called_at is null then 'queue.called_next' else 'queue.recalled' end,
    'registration', new.id, json_object('queue_number', new.queue_number, 'queue_date', new.queue_date), new.last_called_at);
end;

drop trigger clear_returned_registration;
create trigger if not exists clear_returned_registration
after update of called_at on registrations
when old.called_at is not null and new.called_at is null
begin
  insert into audit_logs (branch, actor_id, action, entity_type, entity_id, metadata, created_at)
  values (new.branch, new.queue_actor_id, 'queue.returned_to_waiting', 'registration', new.id,
    json_object('queue_number', old.queue_number, 'queue_date', old.queue_date,
      'previous_first_called_at', strftime('%Y-%m-%dT%H:%M:%fZ', old.called_at / 1000.0, 'unixepoch'),
      'previous_last_called_at', strftime('%Y-%m-%dT%H:%M:%fZ', old.last_called_at / 1000.0, 'unixepoch'),
      'display_cleared', json(case when exists (select 1 from display_state where registration_id = new.id) then 'true' else 'false' end)),
    cast(unixepoch('subsec') * 1000 as integer));
  update display_state set registration_id = null, queue_date = null, queue_number = null, called_at = null,
    revision = revision + 1 where registration_id = new.id;
end;
