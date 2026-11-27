-- Sample records for an empty preview database only.
insert into preview_roster_samples
select column1, column2, column3 from (values
  ('medical_personnel', 'staff-demo-1', '{"personnel_code":"BS-THU-01","full_name":"Bác sĩ thử nghiệm","identity_number":"","practicing_certificate":"","specialties":[],"role_type":"doctor","phone_number":"","email":"","fixed_cost":1500000,"is_active":true}'),
  ('medical_personnel', 'staff-demo-2', '{"personnel_code":"DD-THU-01","full_name":"Điều dưỡng thử nghiệm","identity_number":"","practicing_certificate":"","specialties":[],"role_type":"nurse","phone_number":"","email":"","fixed_cost":800000,"is_active":true}'),
  ('clinic_rooms', 'room-demo-1', '{"branch_code":"q1","room_name":"Phòng khám thử","display_order":1,"is_active":true,"inactive_from":null,"doctor_specialty":null}'),
  ('roster_schedules', 'schedule-demo-1', '{"schedule_type":"insite","branch_code":"q1","campaign_code":null,"company_name":"","position_list":[],"date_offset":0}'),
  ('roster_schedules', 'schedule-demo-2', '{"schedule_type":"onsite_exam","branch_code":"q1","campaign_code":"DEMO-ONSITE","company_name":"Công ty thử nghiệm","position_list":["Điều dưỡng"],"date_offset":0}'),
  ('roster_assignments', 'assignment-demo-1', '{"schedule_id":"schedule-demo-1","room_id":"room-demo-1","personnel_id":"staff-demo-1","position_label":"","shift_period":"AM","start_minute":435,"end_minute":735,"base_cost_snapshot":937500,"allowance_cost":0,"total_cost":937500}'),
  ('roster_assignments', 'assignment-demo-2', '{"schedule_id":"schedule-demo-2","room_id":null,"personnel_id":"staff-demo-2","position_label":"Điều dưỡng","shift_period":"AM","start_minute":420,"end_minute":660,"base_cost_snapshot":400000,"allowance_cost":50000,"total_cost":450000}')
)
where (select revision from preview_roster_revision where id = 1) = 0
  and not exists (select 1 from preview_roster_samples)
on conflict (resource, id) do nothing;

-- Once editable, sample schedules stay on their original calendar date.
update preview_roster_samples
set record = json_remove(json_set(record, '$.schedule_date', date('now', '+7 hours'),
  '$.campaign_group_id', id), '$.date_offset')
where resource = 'roster_schedules' and json_type(record, '$.date_offset') = 'integer';

update preview_roster_samples
set record = json_set(record, '$.day_rate_snapshot', case id when 'assignment-demo-1' then 1500000 else 800000 end)
where resource = 'roster_assignments' and id in ('assignment-demo-1', 'assignment-demo-2')
  and json_type(record, '$.day_rate_snapshot') is null;
