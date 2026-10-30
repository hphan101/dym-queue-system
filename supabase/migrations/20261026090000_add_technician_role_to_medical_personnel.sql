-- Allow 'technician' (Kỹ thuật viên / Khác) in public.medical_personnel.role_type
alter table public.medical_personnel
  drop constraint if exists medical_personnel_role_type_check;

alter table public.medical_personnel
  add constraint medical_personnel_role_type_check
  check (role_type in ('doctor', 'nurse', 'technician', 'ctv'));
