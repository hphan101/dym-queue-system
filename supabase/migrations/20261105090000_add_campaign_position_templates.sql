create function public.valid_roster_position_template(items text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(items) <= 100
    and not exists (select 1 from unnest(items) as p(name)
      where name is null or char_length(btrim(name)) not between 1 and 200)
    and cardinality(items) = (select count(distinct btrim(name)) from unnest(items) as p(name));
$$;

create table public.roster_position_templates (
  schedule_type text primary key check (schedule_type in ('onsite_exam', 'blood_draw', 'setup')),
  positions text[] not null check (public.valid_roster_position_template(positions)),
  updated_at timestamptz not null default now()
);

alter table public.roster_position_templates enable row level security;
grant select, insert, update on public.roster_position_templates to authenticated;
grant all on public.roster_position_templates to service_role;
create policy roster_position_templates_read on public.roster_position_templates
  for select to authenticated using (public.can_manage_roster());
create policy roster_position_templates_insert on public.roster_position_templates
  for insert to authenticated with check (public.is_admin());
create policy roster_position_templates_update on public.roster_position_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.roster_position_templates(schedule_type, positions) values
('onsite_exam', array[
  'Đo huyết áp & Sinh hiệu', 'Khám Nội tổng quát', 'Khám Ngoại — Da liễu',
  'Khám Mắt (Thị lực)', 'Khám Tai Mũi Họng', 'Khám Răng Hàm Mặt',
  'Khám Sản Phụ khoa', 'Siêu âm tổng quát', 'Điện tâm đồ (ECG)',
  'Chụp X-Quang lưu động', 'Điều phối đoàn khám'
]),
('blood_draw', array['Điểm lấy máu 1', 'Điểm lấy máu 2', 'Điểm lấy máu 3', 'Tiếp nhận & Điều phối mẫu']),
('setup', array[]::text[]);
