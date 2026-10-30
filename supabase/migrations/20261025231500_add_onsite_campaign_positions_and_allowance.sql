-- Add default per-person allowance and position template list to roster_schedules for Onsite & Blood Draw campaigns
alter table public.roster_schedules
  add column if not exists default_allowance bigint not null default 0 check (default_allowance >= 0),
  add column if not exists position_list jsonb not null default '[]'::jsonb;

-- Backfill position_list for existing onsite_exam / blood_draw campaigns from existing roster_assignments
update public.roster_schedules s
set position_list = coalesce(
  (
    select jsonb_agg(sub.position_label order by sub.min_order)
    from (
      select
        trim(ra.position_label) as position_label,
        min(ra.sort_order) as min_order
      from public.roster_assignments ra
      where ra.schedule_id = s.id
        and length(trim(ra.position_label)) > 0
      group by trim(ra.position_label)
    ) sub
  ),
  case
    when s.schedule_type = 'blood_draw' then '["Điểm lấy máu 1", "Điểm lấy máu 2", "Điểm lấy máu 3", "Tiếp nhận & Điều phối mẫu"]'::jsonb
    when s.schedule_type = 'onsite_exam' then '["Đo huyết áp & Sinh hiệu", "Khám Nội tổng quát", "Khám Ngoại — Da liễu", "Khám Mắt (Thị lực)", "Khám Tai Mũi Họng", "Khám Răng Hàm Mặt", "Khám Sản Phụ khoa", "Siêu âm tổng quát", "Điện tâm đồ (ECG)", "Chụp X-Quang lưu động", "Điều phối đoàn khám"]'::jsonb
    else '[]'::jsonb
  end
)
where s.schedule_type in ('onsite_exam', 'blood_draw')
  and jsonb_array_length(s.position_list) = 0;
