alter table public.medical_personnel add column specialties text[] not null default '{}'
  check (specialties <@ array['internal','ultrasound','ophthalmology','ent','dentistry','gynecology','radiology','dermatology','surgery']::text[]);
alter table public.clinic_rooms add column doctor_specialty text
  check (doctor_specialty in ('internal','ultrasound','ophthalmology','ent','dentistry','gynecology','radiology','dermatology','surgery'));
update public.clinic_rooms set doctor_specialty = case
  when room_name ~* '(IMD|REPORT|Nội|Internal)' then 'internal'
  when room_name ~* '(^SA[0-9 ]|^SA$|Siêu âm|U/S|Ultrasound)' then 'ultrasound'
  when room_name ~* '(EYE|Mắt)' then 'ophthalmology'
  when room_name ~* '(ENT|Tai Mũi Họng)' then 'ent'
  when room_name ~* '(DENTAL|Răng)' then 'dentistry'
  when room_name ~* '(GYN|Phụ khoa)' then 'gynecology'
  when room_name ~* '(XRAY|X-RAY|Xray|X-quang)' then 'radiology'
  when room_name ~* '(Da liễu)' then 'dermatology'
  when room_name ~* '(Ngoại)' then 'surgery'
  else null end;

-- Reuse existing branch-scoped schedule policies for admin and operations staff.
alter table public.roster_schedules add column provisional_cost bigint not null default 0
  check (provisional_cost >= 0 and provisional_cost <= 1000000000000);
