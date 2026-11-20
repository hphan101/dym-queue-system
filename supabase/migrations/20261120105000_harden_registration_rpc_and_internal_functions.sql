-- Restore the module permission removed when the registration RPC was redefined.
do $$
declare
  definition text := pg_get_functiondef(
    'public.update_registration_details(uuid,text,date,text,text,text,text,text,text,text,jsonb)'::regprocedure
  );
  guarded_definition text;
begin
  guarded_definition := regexp_replace(
    definition,
    E'\n[[:blank:]]*begin\n',
    E'\nbegin\n  perform public.require_permission(''registrations'', ''update'');\n',
    'i'
  );
  if guarded_definition = definition then
    raise exception 'Could not restore the registration update permission check';
  end if;
  execute guarded_definition;
end;
$$;

revoke execute on function public.guard_roster_assignment_time_overlap()
  from public, anon, authenticated;
revoke execute on function public.require_permission(text, text)
  from public, anon, authenticated;
revoke execute on function public.can_edit_roster_date(date)
  from public, anon, authenticated;

-- This event trigger is provisioned by some Supabase projects outside migrations.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc
    where oid = to_regprocedure('public.rls_auto_enable()')
      and prorettype = 'pg_catalog.event_trigger'::regtype
  ) then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$$;

create schema if not exists extensions;
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_extension
    where extname = 'pg_trgm' and extnamespace = 'public'::regnamespace
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end;
$$;
