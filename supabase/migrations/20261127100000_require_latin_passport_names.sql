create function public.guard_registration_passport_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.full_name is not distinct from old.full_name
      and new.identity_document is not distinct from old.identity_document
      and (new.tt25_data->>'identityDocumentType') is not distinct from (old.tt25_data->>'identityDocumentType')
    then
      return new;
    end if;
  end if;

  if coalesce(new.tt25_data->>'identityDocumentType',
      case when btrim(new.identity_document) ~ '^[0-9]{12}$' then 'cccd' else 'passport' end) = 'passport'
    and normalize(btrim(new.full_name), NFC) collate "C" !~ '^[A-Za-zÀ-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]+([ ''’-]+[A-Za-zÀ-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]+)*$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DATA', detail = 'fullName', hint = 'passport_name';
  end if;
  return new;
end;
$$;

create trigger guard_registration_passport_name
before insert or update of full_name, identity_document, tt25_data on public.registrations
for each row execute function public.guard_registration_passport_name();

revoke all on function public.guard_registration_passport_name() from public, anon, authenticated;
