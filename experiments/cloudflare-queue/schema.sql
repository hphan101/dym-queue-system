create table if not exists registrations (
  id text primary key,
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  queue_number integer not null check (queue_number > 0),
  demo_code text not null,
  registered_at integer not null,
  called_at integer,
  state text not null default 'active' check (state in ('active', 'completed', 'cancelled')),
  last_called_at integer,
  first_called_by text,
  queue_actor_id text,
  unique (branch, queue_date, queue_number)
) strict;

create index if not exists registrations_recent_code
  on registrations (branch, demo_code, registered_at);

create index if not exists registrations_recent_branch_time
  on registrations (branch, registered_at);

create index if not exists registrations_waiting
  on registrations (branch, queue_date, queue_number) where state = 'active' and called_at is null;

create table if not exists daily_queue_counters (
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  last_number integer not null check (last_number between 0 and 9999),
  primary key (branch, queue_date)
) strict;

insert into daily_queue_counters (branch, queue_date, last_number)
select branch, queue_date, max(queue_number) from registrations group by branch, queue_date
on conflict (branch, queue_date) do update set last_number = max(last_number, excluded.last_number);

create trigger if not exists keep_last_queue_number
after insert on registrations
begin
  insert into daily_queue_counters (branch, queue_date, last_number)
  values (new.branch, new.queue_date, new.queue_number)
  on conflict (branch, queue_date) do update set last_number = max(last_number, excluded.last_number);
end;

create table if not exists display_state (
  branch text primary key,
  registration_id text references registrations (id),
  queue_date text,
  queue_number integer,
  called_at integer,
  revision integer not null
) strict;

insert into display_state (branch, registration_id, queue_date, queue_number, called_at, revision)
select branch, id, queue_date, queue_number, called_at, 1 from (
  select *, row_number() over (partition by branch order by queue_date desc, queue_number desc) as position
  from registrations where called_at is not null
) where position = 1 on conflict (branch) do nothing;

create trigger if not exists show_called_registration
after update of called_at on registrations
when old.called_at is null and new.called_at is not null
begin
  insert into display_state (branch, registration_id, queue_date, queue_number, called_at, revision)
  values (new.branch, new.id, new.queue_date, new.queue_number, new.called_at, 1)
  on conflict (branch) do update set registration_id = new.id, queue_date = new.queue_date,
    queue_number = new.queue_number, called_at = new.called_at, revision = revision + 1;
end;

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

create table if not exists preview_staff_sessions (
  token_hash text primary key,
  expires_at integer not null
) strict;

create table if not exists preview_staff_accounts (
  id text primary key,
  login_name text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'operator', 'receptionist')),
  branches text not null check (json_valid(branches)),
  permissions text not null check (json_valid(permissions)),
  can_edit_history integer not null default 0,
  is_active integer not null default 1,
  password_hash text not null,
  password_salt text not null,
  session_version integer not null default 0,
  created_at integer not null,
  last_sign_in integer
) strict;

create table if not exists preview_managed_staff_sessions (
  token_hash text primary key,
  user_id text not null references preview_staff_accounts (id) on delete cascade,
  session_version integer not null,
  expires_at integer not null
) strict;

create index if not exists preview_managed_staff_sessions_user on preview_managed_staff_sessions(user_id);

create table if not exists preview_staff_login_limits (
  key text primary key,
  bucket integer not null,
  attempts integer not null
) strict;

create table if not exists preview_registration_sessions (
  token_hash text primary key,
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  expires_at integer not null
) strict;

create table if not exists registration_failure_counts (
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  kind text not null check (kind in ('qr_expired', 'session_expired', 'duplicate_document', 'invalid_data', 'server_error')),
  total integer not null default 1 check (total > 0),
  primary key (queue_date, branch, kind)
);

create table if not exists preview_registration_ip_limits (
  fingerprint text primary key,
  started_at integer not null,
  request_count integer not null check (request_count between 1 and 600)
) strict;

create table if not exists preview_registration_submissions (
  token_hash text primary key references preview_registration_sessions (token_hash),
  registration_id text not null unique references registrations (id),
  request_hash text check (length(request_hash) = 64 and request_hash not glob '*[^0-9a-f]*')
) strict;

create table if not exists preview_print_status (
  registration_id text primary key references registrations (id),
  consent integer not null default 0,
  tt25 integer not null default 0
) strict;

create table if not exists preview_registration_edits (
  registration_id text primary key references registrations (id),
  details text not null default '{}' check (json_valid(details)),
  locked integer not null default 0 check (locked in (0, 1))
) strict;

create trigger if not exists preview_lock_customer_edit_on_call
after update of called_at on registrations
when new.called_at is not null
begin
  insert into preview_registration_edits (registration_id, locked) values (new.id, 1)
  on conflict (registration_id) do update set locked = 1;
end;

create trigger if not exists preview_lock_customer_edit_on_print
after insert on preview_print_status
when new.consent or new.tt25
begin
  insert into preview_registration_edits (registration_id, locked) values (new.registration_id, 1)
  on conflict (registration_id) do update set locked = 1;
end;

create trigger if not exists preview_lock_customer_edit_on_print_update
after update on preview_print_status
when new.consent or new.tt25
begin
  insert into preview_registration_edits (registration_id, locked) values (new.registration_id, 1)
  on conflict (registration_id) do update set locked = 1;
end;

insert into preview_registration_edits (registration_id, locked)
select r.id, 1 from registrations r left join preview_print_status p on p.registration_id = r.id
where r.called_at is not null or p.consent or p.tt25
on conflict (registration_id) do update set locked = 1;

create table if not exists preview_roster_samples (
  resource text not null,
  id text not null,
  record text not null check (json_valid(record)),
  primary key (resource, id)
) strict;

create table if not exists preview_personnel_documents (
  id text primary key,
  personnel_id text not null,
  personnel_resource text not null default 'medical_personnel' check (personnel_resource = 'medical_personnel'),
  kind text not null check (kind in ('identity', 'certificate')),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size integer not null check (file_size between 1 and 10485760),
  state text not null default 'ready' check (state in ('ready', 'deleting')),
  created_at text not null,
  foreign key (personnel_resource, personnel_id) references preview_roster_samples(resource, id) on delete restrict
) strict;

create index if not exists preview_personnel_documents_personnel on preview_personnel_documents(personnel_resource, personnel_id, state);

create table if not exists preview_roster_revision (
  id integer primary key check (id = 1),
  revision integer not null
) strict;

insert into preview_roster_revision values (1, 0) on conflict do nothing;
