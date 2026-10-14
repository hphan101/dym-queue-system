-- Reception staff only need queue-operating fields. RLS still decides which
-- branch rows they may see; these grants additionally prevent reading PII
-- columns that the queue UI never uses.
revoke select on table public.registrations from authenticated;

grant select (
  id,
  branch_id,
  queue_date,
  queue_number,
  full_name,
  phone_number,
  state,
  registered_at,
  first_called_at,
  last_called_at,
  updated_at
) on table public.registrations to authenticated;

-- Make the migration fail if a future privilege change accidentally leaves
-- any protected column readable by the authenticated browser role.
do $$
declare
  protected_column text;
begin
  foreach protected_column in array array[
    'birth_date',
    'gender',
    'identity_document',
    'company_name',
    'province',
    'ward',
    'address_detail',
    'checked_in_at',
    'checked_in_by',
    'completed_at',
    'cancelled_at',
    'first_called_by'
  ]
  loop
    if has_column_privilege(
      'authenticated',
      'public.registrations',
      protected_column,
      'select'
    ) then
      raise exception 'Protected column is still selectable: %', protected_column;
    end if;
  end loop;
end;
$$;
