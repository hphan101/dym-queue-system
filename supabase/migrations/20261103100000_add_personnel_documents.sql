insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personnel-documents', 'personnel-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']);

create table public.personnel_documents (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.medical_personnel(id) on delete restrict,
  kind text not null check (kind in ('identity', 'certificate')),
  object_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size integer not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  constraint personnel_document_path check (
    object_path like personnel_id::text || '/' || kind || '/%'
  )
);
create index personnel_documents_personnel_idx on public.personnel_documents (personnel_id);
alter table public.personnel_documents enable row level security;
revoke all on public.personnel_documents from anon, authenticated;
grant select, insert on public.personnel_documents to authenticated;
grant all on public.personnel_documents to service_role;
create policy personnel_documents_admin_select on public.personnel_documents
  for select to authenticated using (public.is_admin());
create policy personnel_documents_admin_insert on public.personnel_documents
  for insert to authenticated with check (public.is_admin());

create policy personnel_scan_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'personnel-documents' and public.is_admin());
create policy personnel_scan_admin_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'personnel-documents' and public.is_admin()
    and (storage.foldername(name))[2] in ('identity', 'certificate')
    and exists (
      select 1 from public.medical_personnel p
      where p.id::text = (storage.foldername(name))[1]
    )
  );
-- Permit cleanup of an unlinked upload if saving its metadata fails.
create policy personnel_scan_admin_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'personnel-documents' and public.is_admin()
    and not exists (
      select 1 from public.personnel_documents d where d.object_path = name
    )
  );
