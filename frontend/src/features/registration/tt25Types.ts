import type { BranchCode } from '../../types/domain';
import type { SupportedLanguage } from '../../locales/types';

export function getTT25PrintCopies(data: Pick<TT25RegistrationData, 'checkupReason'>): number {
  return /work\s*permit|\bwp\b|khác|cá nhân|đi học|đi làm|khám lẻ/i.test(data.checkupReason || '') ? 2 : 1;
}

export interface TT25PersonalHistoryItem {
  id: number;
  name: string;
  nameEn: string;
  nameJa: string;
}

export const TT25_PERSONAL_DISEASES: TT25PersonalHistoryItem[] = [
  { id: 1, name: 'Có bệnh hay bị thương trong 5 năm qua', nameEn: 'Illness or injury within the past 5 years', nameJa: '過去5年以内の病気やけが' },
  { id: 2, name: 'Có bệnh thần kinh hay bị thương ở đầu', nameEn: 'Neurological disorder or head injury', nameJa: '神経疾患または頭部のけが' },
  { id: 3, name: 'Bệnh mắt hoặc giảm thị lực (trừ trường hợp đeo kính thuốc)', nameEn: 'Eye disease or vision impairment (excluding prescription glasses)', nameJa: '眼の病気または視力低下（眼鏡による矯正を除く）' },
  { id: 4, name: 'Bệnh ở tai, giảm sức nghe hoặc thăng bằng', nameEn: 'Ear disease, hearing loss, or balance disorder', nameJa: '耳の病気、聴力低下または平衡感覚の障害' },
  { id: 5, name: 'Bệnh ở tim, hoặc nhồi máu cơ tim, các bệnh tim mạch khác', nameEn: 'Heart disease, myocardial infarction, or other cardiovascular conditions', nameJa: '心臓病、心筋梗塞またはその他の心血管疾患' },
  { id: 6, name: 'Phẫu thuật can thiệp tim - mạch (thay van, bắc cầu nối, tạo hình mạch, máy tạo nhịp, đặt stent mạch, ghép tim)', nameEn: 'Cardiovascular surgery/intervention (valve replacement, bypass, pacemaker, stent, heart transplant)', nameJa: '心臓・血管の手術や治療（弁置換、バイパス、血管形成、ペースメーカー、ステント、心臓移植など）' },
  { id: 7, name: 'Tăng huyết áp', nameEn: 'High blood pressure (Hypertension)', nameJa: '高血圧' },
  { id: 8, name: 'Khó thở', nameEn: 'Shortness of breath / Difficulty breathing', nameJa: '息切れ・呼吸困難' },
  { id: 9, name: 'Bệnh phổi, hen, khí phế thũng, viêm phế quản mạn tính', nameEn: 'Lung disease, asthma, emphysema, or chronic bronchitis', nameJa: '肺疾患、喘息、肺気腫または慢性気管支炎' },
  { id: 10, name: 'Bệnh thận, lọc máu', nameEn: 'Kidney disease or dialysis', nameJa: '腎疾患または透析' },
  { id: 11, name: 'Nghiện rượu, bia', nameEn: 'Alcohol addiction / dependency', nameJa: 'アルコール依存症' },
  { id: 12, name: 'Đái tháo đường hoặc kiểm soát tăng đường huyết', nameEn: 'Diabetes or hyperglycemia management', nameJa: '糖尿病または高血糖の管理' },
  { id: 13, name: 'Bệnh tâm thần', nameEn: 'Mental health / psychiatric disorder', nameJa: '精神疾患' },
  { id: 14, name: 'Mất ý thức, rối loạn ý thức', nameEn: 'Loss of consciousness or consciousness disorder', nameJa: '意識消失または意識障害' },
  { id: 15, name: 'Ngất, chóng mặt', nameEn: 'Fainting (syncope) or dizziness', nameJa: '失神・めまい' },
  { id: 16, name: 'Bệnh tiêu hóa', nameEn: 'Digestive / gastrointestinal disease', nameJa: '消化器疾患' },
  { id: 17, name: 'Rối loạn giấc ngủ, ngừng thở khi ngủ, ngủ rũ ban ngày, ngáy to', nameEn: 'Sleep disorder, sleep apnea, narcolepsy, or severe snoring', nameJa: '睡眠障害、睡眠時無呼吸、日中の強い眠気、大きないびき' },
  { id: 18, name: 'Tai biến mạch máu não hoặc liệt', nameEn: 'Stroke (cerebrovascular accident) or paralysis', nameJa: '脳卒中または麻痺' },
  { id: 19, name: 'Bệnh hoặc tổn thương cột sống', nameEn: 'Spinal disease or spinal injury', nameJa: '脊椎の病気やけが' },
  { id: 20, name: 'Sử dụng rượu, bia thường xuyên, liên tục', nameEn: 'Regular or continuous alcohol consumption', nameJa: '習慣的または継続的な飲酒' },
  { id: 21, name: 'Sử dụng ma túy và chất gây nghiện', nameEn: 'Use of narcotics or addictive substances', nameJa: '薬物や依存性物質の使用' },
  { id: 22, name: 'Bệnh khác (ghi rõ)', nameEn: 'Other conditions (please specify)', nameJa: 'その他の病気（具体的に記入）' },
];

export interface TT25MedicalHistory {
  familyHistory: {
    hasDisease: boolean | null;
    diseaseDetails: string;
  };
  personalHistory: Record<number, boolean>;
  personalOtherDetails: string;
  currentTreatment: {
    isTreating: boolean | null;
    medications: string;
  };
  pregnancyHistory?: {
    hasHistory: boolean | null;
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

export const CONSENT_FORM_VERSION = 'DYM.PRO.09.FOR.02.03-2026-11-19';

export const PREGNANCY_STATUS_LABELS = {
  not_pregnant: { vi: 'Không mang thai', en: 'Not pregnant', ja: '妊娠していない' },
  suspected: { vi: 'Nghi ngờ mang thai', en: 'Suspected pregnancy', ja: '妊娠の可能性がある' },
  pregnant: { vi: 'Đang mang thai', en: 'Pregnant', ja: '妊娠中' },
} as const;

export type PregnancyStatus = keyof typeof PREGNANCY_STATUS_LABELS;

export interface TT25RegistrationData {
  branch: BranchCode;
  // 12 muc hanh chinh
  fullName: string;
  gender: 'Nam' | 'Nữ';
  pregnancyStatus?: PregnancyStatus;
  birthDate: string; // YYYY-MM-DD
  ethnicity: string; // Mặc định: "Kinh"
  bloodGroup: string; // "A" | "B" | "AB" | "O" | "Chưa rõ"
  cccd: string; // 12 số CCCD / hộ chiếu
  identityDocumentType?: 'cccd' | 'passport';
  insuranceNumber: string; // 15 ký tự BHYT
  province: string;
  ward: string;
  addressDetail: string;
  occupation: string;
  workplace: string;
  workplaceWard: string;
  phoneNumber: string;
  email?: string;
  checkupReason: string; // Lý do khám sức khỏe
  
  // Tien su benh ly
  medicalHistory: TT25MedicalHistory;

  // Thong tin doi tuong - chi tra
  targetPayment?: TT25TargetPaymentInfo;

  // Dong thuan kham & thong tin in phieu
  consentAgreed?: boolean;
  advertisingConsentAgreed?: boolean;
  consentFormVersion?: string;
  queueNumber?: string;
  checkupDate?: string;
  language?: SupportedLanguage;
  
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
    pregnancyStatus: fields.pregnancyStatus,
    birthDate: fields.birthDate ?? '',
    ethnicity: fields.ethnicity ?? 'Kinh',
    bloodGroup: fields.bloodGroup ?? 'Chưa rõ',
    cccd: fields.cccd ?? '',
    identityDocumentType: fields.identityDocumentType,
    insuranceNumber: fields.insuranceNumber ?? '',
    province: fields.province ?? '',
    ward: fields.ward ?? '',
    addressDetail: fields.addressDetail ?? '',
    occupation: fields.occupation ?? '',
    workplace: fields.workplace ?? '',
    workplaceWard: fields.workplaceWard ?? '',
    phoneNumber: fields.phoneNumber ?? '',
    email: fields.email ?? '',
    checkupReason: fields.checkupReason ?? 'Khám sức khỏe định kỳ / đi làm / đi học',
    medicalHistory: fields.medicalHistory ?? INITIAL_TT25_MEDICAL_HISTORY,
    targetPayment: fields.targetPayment ?? defaultTargetPayment,
    consentAgreed: fields.consentAgreed ?? true,
    advertisingConsentAgreed: fields.advertisingConsentAgreed,
    consentFormVersion: fields.consentFormVersion,
    queueNumber: fields.queueNumber,
    checkupDate: fields.checkupDate,
    language: fields.language,
    honeypot: fields.honeypot,
  };
}
