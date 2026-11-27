create table if not exists preview_registration_ip_limits (
  fingerprint text primary key,
  started_at integer not null,
  request_count integer not null check (request_count between 1 and 600)
) strict;
