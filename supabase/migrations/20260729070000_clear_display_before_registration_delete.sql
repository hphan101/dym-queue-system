-- A displayed registration cannot be deleted while only registration_id is
-- cleared: the display row requires all call fields to become null together.
create or replace function public.clear_display_before_registration_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.branch_display_state
  set registration_id = null,
      queue_date = null,
      queue_number = null,
      called_at = null,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where registration_id = old.id;

  return old;
end;
$$;

revoke all on function public.clear_display_before_registration_delete()
from public, anon, authenticated;

drop trigger if exists clear_display_before_registration_delete
on public.registrations;

create trigger clear_display_before_registration_delete
before delete on public.registrations
for each row
execute function public.clear_display_before_registration_delete();
