-- Keep identifiers as text so leading zeroes are retained.
alter table public.medical_personnel
  add column identity_number text not null default ''
    check (identity_number = '' or identity_number ~ '^[0-9]{12}$'),
  add column practicing_certificate text not null default ''
    check (char_length(practicing_certificate) <= 100);
