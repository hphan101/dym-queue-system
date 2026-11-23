export const ETHNIC_GROUPS = [
  'Kinh', 'Tày', 'Thái', 'Mường', 'H\'Mông', 'Dao', 'Khmer', 'Nùng', 'Hoa',
  'Gia Rai', 'Ê Đê', 'Ba Na', 'Xơ Đăng', 'Sán Chay', 'Cơ Ho', 'Chăm', 'Sán Dìu',
  'Hrê', 'Ra Glai', 'M\'Nông', 'Xtiêng', 'Bru - Vân Kiều', 'Thổ', 'Khơ Mú',
  'Cơ Tu', 'Giáy', 'Tà Ôi', 'Mạ', 'Giẻ-Triêng', 'Co', 'Chơ Ro', 'Xinh Mun',
  'Hà Nhì', 'Chu Ru', 'Lào', 'La Chí', 'La Ha', 'Phù Lá', 'La Hủ', 'Lự',
  'Lô Lô', 'Chứt', 'Mảng', 'Pà Thẻn', 'Cờ Lao', 'Cống', 'Bố Y', 'Si La',
  'Pu Péo', 'Rơ Măm', 'Brâu', 'Ơ Đu', 'Người nước ngoài'
];

export const BLOOD_GROUPS = [
  'Chưa rõ',
  'A (Rh+)',
  'B (Rh+)',
  'O (Rh+)',
  'AB (Rh+)',
  'A (Rh-)',
  'B (Rh-)',
  'O (Rh-)',
  'AB (Rh-)',
];

export const CHECKUP_REASON_OPTIONS = [
  { value: 'Khám sức khỏe định kì doanh nghiệp', labelEn: 'Corporate periodic health checkup', labelJa: '企業の定期健康診断' },
  { value: 'Khám sức khỏe bổ sung hồ sơ xin Work Permit', labelEn: 'Health checkup for a Work Permit application', labelJa: '労働許可証申請用の健康診断' },
  { value: 'Khám sức khỏe khác', labelEn: 'Other health checkups', labelJa: 'その他の健康診断' },
] as const;

export const CHECKUP_REASONS = CHECKUP_REASON_OPTIONS.map((option) => option.value);

export function requiresCompanyName(reason: string): boolean {
  return /công ty|doanh nghiệp/i.test(reason);
}

export function isWorkPermitCheckup(reason: string): boolean {
  return /work permit/i.test(reason);
}

