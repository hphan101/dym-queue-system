alter table public.roster_schedules
  add column campaign_group_id uuid not null default gen_random_uuid(),
  add column setup_onsite_ids uuid[] not null default '{}';
create index roster_schedules_campaign_group on public.roster_schedules(campaign_group_id);

-- A write to a schedule and its links is one transaction. Foreign keys protect HC dates from deletion.
create table public.roster_setup_links (
  setup_id uuid not null references public.roster_schedules(id) on delete cascade,
  onsite_id uuid not null references public.roster_schedules(id) on delete restrict,
  primary key(setup_id, onsite_id)
);
create index roster_setup_links_onsite on public.roster_setup_links(onsite_id);
alter table public.roster_setup_links enable row level security;
grant select on public.roster_setup_links to authenticated;
grant all on public.roster_setup_links to service_role;
create policy roster_setup_links_read on public.roster_setup_links for select to authenticated
  using (public.can_manage_roster() and exists (
    select 1 from public.roster_schedules s where s.id=setup_id and public.can_access_branch_code(s.branch_code)
  ));

create function public.guard_roster_setup_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target public.roster_schedules; target_count int; group_count int;
begin
  if tg_op <> 'INSERT' then
    if exists(select 1 from public.roster_setup_links where onsite_id=old.id) then
      if tg_op='DELETE' then
        raise exception 'Đoàn HC đang có lịch set-up. Hãy đổi liên kết set-up trước khi xóa.';
      end if;
      if new.schedule_type is distinct from old.schedule_type or new.branch_code is distinct from old.branch_code
        or new.schedule_date is distinct from old.schedule_date or new.company_name is distinct from old.company_name
        or new.campaign_group_id is distinct from old.campaign_group_id then
        raise exception 'Đoàn HC đang có lịch set-up. Hãy cập nhật liên kết set-up trước khi đổi thông tin đoàn.';
      end if;
    end if;
    if tg_op='DELETE' then return old; end if;
    if new.campaign_group_id is distinct from old.campaign_group_id then
      raise exception 'Không thể đổi mã đợt khám của lịch đã lưu.';
    end if;
  end if;
  if new.schedule_type <> 'setup' then new.setup_onsite_ids := '{}'; return new; end if;
  new.setup_onsite_ids := array(select distinct unnest(new.setup_onsite_ids));
  if cardinality(new.setup_onsite_ids)=0 then
    -- Existing independent setup records stay editable until an explicit link is chosen.
    if tg_op='UPDATE' and old.schedule_type='setup' and cardinality(old.setup_onsite_ids)=0 then return new; end if;
    raise exception 'Vui lòng chọn đoàn Onsite HC và ít nhất một ngày khám liên quan.';
  end if;
  perform id from public.roster_schedules where id=any(new.setup_onsite_ids) order by id for share;
  select * into target from public.roster_schedules where id=new.setup_onsite_ids[1] and schedule_type='onsite_exam';
  if target.id is null or target.branch_code <> new.branch_code then raise exception 'Đoàn HC không hợp lệ hoặc khác cơ sở ký hợp đồng.'; end if;
  select count(*), count(distinct campaign_group_id) into target_count, group_count
    from public.roster_schedules where id=any(new.setup_onsite_ids) and schedule_type='onsite_exam'
      and branch_code=new.branch_code and company_name=target.company_name;
  if target_count <> cardinality(new.setup_onsite_ids) or group_count <> 1 then
    raise exception 'Các ngày khám liên quan phải thuộc cùng một đợt Onsite HC và cùng công ty.';
  end if;
  new.company_name := target.company_name;
  return new;
end;
$$;

create function public.sync_roster_setup_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.setup_onsite_ids is not distinct from new.setup_onsite_ids then return new; end if;
  delete from public.roster_setup_links where setup_id=new.id;
  insert into public.roster_setup_links(setup_id, onsite_id) select new.id, unnest(new.setup_onsite_ids);
  return new;
end;
$$;
revoke all on function public.guard_roster_setup_link(), public.sync_roster_setup_links() from public;
create trigger guard_roster_setup_link before insert or update or delete on public.roster_schedules
  for each row execute function public.guard_roster_setup_link();
create trigger sync_roster_setup_links after insert or update on public.roster_schedules
  for each row execute function public.sync_roster_setup_links();
