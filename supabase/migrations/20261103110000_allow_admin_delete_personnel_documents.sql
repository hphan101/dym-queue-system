grant delete on public.personnel_documents to authenticated;
create policy personnel_documents_admin_delete on public.personnel_documents
  for delete to authenticated using (public.is_admin());

drop policy personnel_scan_admin_cleanup on storage.objects;
create policy personnel_scan_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'personnel-documents' and public.is_admin());
