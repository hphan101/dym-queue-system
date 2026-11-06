alter table public.roster_schedules drop constraint roster_schedules_schedule_type_check;
alter table public.roster_schedules add constraint roster_schedules_schedule_type_check
  check (schedule_type in ('insite', 'onsite_exam', 'blood_draw', 'setup'));
