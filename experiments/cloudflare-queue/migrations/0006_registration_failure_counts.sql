create table if not exists registration_failure_counts (
  branch text not null check (branch in ('q1', 'q7', 'hn')),
  queue_date text not null,
  kind text not null check (kind in ('qr_expired', 'session_expired', 'duplicate_document', 'invalid_data', 'server_error')),
  total integer not null default 1 check (total > 0),
  primary key (queue_date, branch, kind)
);
