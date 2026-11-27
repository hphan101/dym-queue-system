alter table preview_registration_submissions
  add column request_hash text check (length(request_hash) = 64 and request_hash not glob '*[^0-9a-f]*');

create index if not exists registrations_recent_branch_time
  on registrations (branch, registered_at);
