import type { BranchCode } from '../../types/domain';

export interface TT25PersonalHistoryItem {
  id: number;
  name: string;
  nameEn: string;
}

export const TT25_PERSONAL_DISEASES: TT25PersonalHistoryItem[] = [
  { id: 1, name: 'Có bệnh hay bị thương trong 5 năm qua', nameEn: 'Illness or injury within the past 5 years' },
  { id: 2, name: 'Có bệnh thần kinh hay bị thương ở đầu', nameEn: 'Neurological disorder or head injury' },
  { id: 3, name: 'Bệnh mắt hoặc giảm thị lực (trừ trường hợp đeo kính thuốc)', nameEn: 'Eye disease or vision impairment (excluding prescription glasses)' },
  { id: 4, name: 'Bệnh ở tai, giảm sức nghe hoặc thăng bằng', nameEn: 'Ear disease, hearing loss, or balance disorder' },
  { id: 5, name: 'Bệnh ở tim, hoặc nhồi máu cơ tim, các bệnh tim mạch khác', nameEn: 'Heart disease, myocardial infarction, or other cardiovascular conditions' },
  { id: 6, name: 'Phẫu thuật can thiệp tim - mạch (thay van, bắc cầu nối, tạo hình mạch, máy tạo nhịp, đặt stent mạch, ghép tim)', nameEn: 'Cardiovascular surgery/intervention (valve replacement, bypass, pacemaker, stent, heart transplant)' },
  { id: 7, name: 'Tăng huyết áp', nameEn: 'High blood pressure (Hypertension)' },
  { id: 8, name: 'Khó thở', nameEn: 'Shortness of breath / Difficulty breathing' },
  { id: 9, name: 'Bệnh phổi, hen, khí phế thũng, viêm phế quản mạn tính', nameEn: 'Lung disease, asthma, emphysema, or chronic bronchitis' },
  { id: 10, name: 'Bệnh thận, lọc máu', nameEn: 'Kidney disease or dialysis' },
  { id: 11, name: 'Nghiện rượu, bia', nameEn: 'Alcohol addiction / dependency' },
  { id: 12, name: 'Đái tháo đường hoặc kiểm soát tăng đường huyết', nameEn: 'Diabetes or hyperglycemia management' },
  { id: 13, name: 'Bệnh tâm thần', nameEn: 'Mental health / psychiatric disorder' },
  { id: 14, name: 'Mất ý thức, rối loạn ý thức', nameEn: 'Loss of consciousness or consciousness disorder' },
  { id: 15, name: 'Ngất, chóng mặt', nameEn: 'Fainting (syncope) or dizziness' },
  { id: 16, name: 'Bệnh tiêu hóa', nameEn: 'Digestive / gastrointestinal disease' },
  { id: 17, name: 'Rối loạn giấc ngủ, ngừng thở khi ngủ, ngủ rũ ban ngày, ngáy to', nameEn: 'Sleep disorder, sleep apnea, narcolepsy, or severe snoring' },
  { id: 18, name: 'Tai biến mạch máu não hoặc liệt', nameEn: 'Stroke (cerebrovascular accident) or paralysis' },
  { id: 19, name: 'Bệnh hoặc tổn thương cột sống', nameEn: 'Spinal disease or spinal injury' },
  { id: 20, name: 'Sử dụng rượu, bia thường xuyên, liên tục', nameEn: 'Regular or continuous alcohol consumption' },
  { id: 21, name: 'Sử dụng ma túy và chất gây nghiện', nameEn: 'Use of narcotics or addictive substances' },
  { id: 22, name: 'Bệnh khác (ghi rõ)', nameEn: 'Other conditions (please specify)' },
];

export interface TT25MedicalHistory {
  familyHistory: {
    hasDisease: boolean;
    diseaseDetails: string;
  };
  personalHistory: Record<number, boolean>;
  personalOtherDetails: string;
  currentTreatment: {
    isTreating: boolean;
    medications: string;
  };
  pregnancyHistory?: {
    hasHistory: boolean;
    details: string;
  };
  commitmentAgreed: boolean;
}

export type TT25TargetGroup = '14' | '15' | '16' | 'other';
export type TT25PaymentSource = 'employer' | 'self' | 'other';
export type TT25ExamLocation =
  | 'cs_kbcb'
  | 'kham_luu_dong'
  | 'tram_y_te'
  | 'truong_hoc'
  | 'ksk_tai_nha';

export interface TT25TargetPaymentInfo {
  targetGroup: TT25TargetGroup;
  targetOtherDetails: string;
  paymentSource: TT25PaymentSource;
  paymentOtherDetails: string;
  examLocation: TT25ExamLocation;
}

export interface TT25RegistrationData {
  branch: BranchCode;
  // 12 muc hanh chinh
  fullName: string;
  gender: 'Nam' | 'Nữ';
  birthDate: string; // YYYY-MM-DD
  ethnicity: string; // Mặc định: "Kinh"
  bloodGroup: string; // "A" | "B" | "AB" | "O" | "Chưa rõ"
  cccd: string; // 12 số CCCD / hộ chiếu
  insuranceNumber: string; // 15 ký tự BHYT
  province: string;
  ward: string;
  addressDetail: string;
  occupation: string;
  workplace: string;
  workplaceWard: string;
  phoneNumber: string;
  checkupReason: string; // Lý do khám sức khỏe
  
  // Tien su benh ly
  medicalHistory: TT25MedicalHistory;

  // Thong tin doi tuong - chi tra
  targetPayment?: TT25TargetPaymentInfo;

  // Dong thuan kham & thong tin in phieu
  consentAgreed?: boolean;
  queueNumber?: string;
  checkupDate?: string;
  
  honeypot?: string;
}

export const INITIAL_TT25_MEDICAL_HISTORY: TT25MedicalHistory = {
  familyHistory: {
    hasDisease: false,
    diseaseDetails: '',
  },
  personalHistory: {
    1: false, 2: false, 3: false, 4: false, 5: false,
    6: false, 7: false, 8: false, 9: false, 10: false,
    11: false, 12: false, 13: false, 14: false, 15: false,
    16: false, 17: false, 18: false, 19: false, 20: false,
    21: false, 22: false,
  },
  personalOtherDetails: '',
  currentTreatment: {
    isTreating: false,
    medications: '',
  },
  pregnancyHistory: {
    hasHistory: false,
    details: '',
  },
  commitmentAgreed: true,
};

export const INITIAL_TT25_TARGET_PAYMENT: TT25TargetPaymentInfo = {
  targetGroup: '15',
  targetOtherDetails: '',
  paymentSource: 'employer',
  paymentOtherDetails: '',
  examLocation: 'cs_kbcb',
};

export function getDefaultTargetPaymentByReason(
  checkupReason?: string,
  hasWorkplace?: boolean,
): TT25TargetPaymentInfo {
  const norm = (checkupReason || '').toLowerCase();
  if (norm.includes('công ty') || norm.includes('định kì') || norm.includes('định kỳ')) {
    return {
      targetGroup: '15',
      targetOtherDetails: '',
      paymentSource: 'employer',
      paymentOtherDetails: '',
      examLocation: 'cs_kbcb',
    };
  }
  if (norm.includes('đi học') || norm.includes('đi làm')) {
    return {
      targetGroup: '15',
      targetOtherDetails: '',
      paymentSource: 'self',
      paymentOtherDetails: '',
      examLocation: 'cs_kbcb',
    };
  }
  if (norm.includes('cá nhân') || norm.includes('tự nguyện')) {
    return {
      targetGroup: '16',
      targetOtherDetails: '',
      paymentSource: 'self',
      paymentOtherDetails: '',
      examLocation: 'cs_kbcb',
    };
  }
  return {
    targetGroup: hasWorkplace ? '15' : '16',
    targetOtherDetails: '',
    paymentSource: hasWorkplace ? 'employer' : 'self',
    paymentOtherDetails: '',
    examLocation: 'cs_kbcb',
  };
}

export function createDefaultTT25Data(
  fields: Partial<TT25RegistrationData> & { branch: BranchCode },
): TT25RegistrationData {
  const defaultTargetPayment = getDefaultTargetPaymentByReason(
    fields.checkupReason,
    Boolean(fields.workplace?.trim()),
  );
  return {
    branch: fields.branch,
    fullName: fields.fullName ?? '',
    gender: fields.gender ?? 'Nam',
    birthDate: fields.birthDate ?? '',
    ethnicity: fields.ethnicity ?? 'Kinh',
    bloodGroup: fields.bloodGroup ?? 'Chưa rõ',
    cccd: fields.cccd ?? '',
    insuranceNumber: fields.insuranceNumber ?? '',
    province: fields.province ?? '',
    ward: fields.ward ?? '',
    addressDetail: fields.addressDetail ?? '',
    occupation: fields.occupation ?? '',
    workplace: fields.workplace ?? '',
    workplaceWard: fields.workplaceWard ?? '',
    phoneNumber: fields.phoneNumber ?? '',
    checkupReason: fields.checkupReason ?? 'Khám sức khỏe định kỳ / đi làm / đi học',
    medicalHistory: fields.medicalHistory ?? INITIAL_TT25_MEDICAL_HISTORY,
    targetPayment: fields.targetPayment ?? defaultTargetPayment,
    consentAgreed: fields.consentAgreed ?? true,
    queueNumber: fields.queueNumber,
    checkupDate: fields.checkupDate,
    honeypot: fields.honeypot,
  };
}
