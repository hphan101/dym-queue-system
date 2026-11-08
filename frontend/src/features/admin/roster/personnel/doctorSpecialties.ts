export const DOCTOR_SPECIALTIES = [
  { value: 'internal', label: 'Nội / Report' },
  { value: 'ultrasound', label: 'Siêu âm' },
  { value: 'ophthalmology', label: 'Mắt' },
  { value: 'ent', label: 'Tai Mũi Họng' },
  { value: 'dentistry', label: 'Răng Hàm Mặt' },
  { value: 'gynecology', label: 'Sản Phụ khoa' },
  { value: 'radiology', label: 'Chẩn đoán hình ảnh / X-quang' },
  { value: 'dermatology', label: 'Da liễu' },
  { value: 'surgery', label: 'Ngoại' },
] as const;
export type DoctorSpecialty = (typeof DOCTOR_SPECIALTIES)[number]['value'];
export function inferDoctorSpecialty(name: string): DoctorSpecialty | null {
  const text = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(imd\d*|noi\d*|internal|report)\b/.test(text)) return 'internal';
  if (/\b(sa\d*|sieu am|ultrasound|u\s*\/\s*s\d*)\b/.test(text))
    return 'ultrasound';
  if (/\b(eye\d*|mat|ophthalmology)\b/.test(text)) return 'ophthalmology';
  if (/\b(ent\d*|tai mui hong)\b/.test(text)) return 'ent';
  if (/\b(dental\d*|rang ham mat|dentistry)\b/.test(text)) return 'dentistry';
  if (/\b(gyn\d*|phu khoa|gynecology)\b/.test(text)) return 'gynecology';
  if (/\b(x\s*-?\s*ray\d*|xquang|x quang|radiology)\b/.test(text))
    return 'radiology';
  if (/\b(da lieu|dermatology)\b/.test(text)) return 'dermatology';
  if (/\b(ngoai|surgery)\b/.test(text)) return 'surgery';
  return null;
}
export function canAssignDoctorToRoom(
  person: { role_type: string; specialties?: readonly string[] },
  specialty: DoctorSpecialty | null,
): boolean {
  return (
    person.role_type !== 'doctor' ||
    (specialty !== null && (person.specialties ?? []).includes(specialty))
  );
}
export function getSpecialtyLabels(values: readonly string[] = []): string {
  return DOCTOR_SPECIALTIES.filter((item) => values.includes(item.value))
    .map((item) => item.label)
    .join(', ');
}
