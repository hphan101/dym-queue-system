import type { BranchCode } from '../../types/domain';
import type {
  TT25MedicalHistory,
  TT25TargetPaymentInfo,
} from '../registration/tt25Types';

export type StaffRole = 'admin' | 'receptionist';
export type StaffStatusTab = 'all' | 'active' | 'locked';

export interface StaffBranch {
  code: BranchCode;
  name: string;
}

export interface StaffAccount {
  userId: string;
  loginName: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  branches: StaffBranch[];
  createdAt: string;
  lastSignInAt: string | null;
}

export interface StaffFormState {
  userId: string | null;
  displayName: string;
  loginName: string;
  password: string;
  role: StaffRole;
  branchCodes: BranchCode[];
}

export interface TT25StoredExtras {
  ethnicity?: string;
  bloodGroup?: string;
  insuranceNumber?: string;
  occupation?: string;
  workplaceProvince?: string;
  workplaceWard?: string;
  checkupReason?: string;
  medicalHistory?: TT25MedicalHistory;
  targetPayment?: TT25TargetPaymentInfo;
  consentAgreed?: boolean;
  printedConsent?: boolean;
  printedTT25?: boolean;
}

export interface RegistrationDetails {
  id: string;
  branch_id: string;
  queue_date: string;
  queue_number: number;
  registered_at: string;
  full_name: string;
  birth_date: string;
  gender: string;
  phone_number: string;
  identity_document: string;
  company_name: string;
  province: string;
  ward: string;
  address_detail: string;
  state: 'active' | 'completed' | 'cancelled';
  first_called_at: string | null;
  last_called_at: string | null;
  tt25_data?: TT25StoredExtras | null;
}

export type RegistrationStatusTab = 'all' | 'waiting' | 'called';

