import type { BranchCode } from '../../types/domain';

export interface TT25PersonalHistoryItem {
  id: number;
  name: string;
}

export const TT25_PERSONAL_DISEASES: TT25PersonalHistoryItem[] = [
  { id: 1, name: 'Có bệnh hay bị thương trong 5 năm qua' },
  { id: 2, name: 'Có bệnh thần kinh hay bị thương ở đầu' },
  { id: 3, name: 'Bệnh mắt hoặc giảm thị lực (trừ trường hợp đeo kính thuốc)' },
  { id: 4, name: 'Bệnh ở tai, giảm sức nghe hoặc thăng bằng' },
  { id: 5, name: 'Bệnh ở tim, hoặc nhồi máu cơ tim, các bệnh tim mạch khác' },
  { id: 6, name: 'Phẫu thuật can thiệp tim - mạch (thay van, bắc cầu nối, tạo hình mạch, máy tạo nhịp, đặt stent mạch, ghép tim)' },
  { id: 7, name: 'Tăng huyết áp' },
  { id: 8, name: 'Khó thở' },
  { id: 9, name: 'Bệnh phổi, hen, khí phế thũng, viêm phế quản mạn tính' },
  { id: 10, name: 'Bệnh thận, lọc máu' },
  { id: 11, name: 'Nghiện rượu, bia' },
  { id: 12, name: 'Đái tháo đường hoặc kiểm soát tăng đường huyết' },
  { id: 13, name: 'Bệnh tâm thần' },
  { id: 14, name: 'Mất ý thức, rối loạn ý thức' },
  { id: 15, name: 'Ngất, chóng mặt' },
  { id: 16, name: 'Bệnh tiêu hóa' },
  { id: 17, name: 'Rối loạn giấc ngủ, ngừng thở khi ngủ, ngủ rũ ban ngày, ngáy to' },
  { id: 18, name: 'Tai biến mạch máu não hoặc liệt' },
  { id: 19, name: 'Bệnh hoặc tổn thương cột sống' },
  { id: 20, name: 'Sử dụng rượu, bia thường xuyên, liên tục' },
  { id: 21, name: 'Sử dụng ma túy và chất gây nghiện' },
  { id: 22, name: 'Bệnh khác (ghi rõ)' },
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

