import type { PregnancyStatus, TT25MedicalHistory, TT25TargetPaymentInfo } from '../../registration/tt25Types';

export interface TT25StoredExtras {
  identityDocumentType?: 'cccd' | 'passport';
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
  advertisingConsentAgreed?: boolean;
  consentFormVersion?: string;
  pregnancyStatus?: PregnancyStatus | null;
  printedConsent?: boolean;
  printedTT25?: boolean;
  language?: 'vi' | 'en' | 'ja';
  email?: string;
}

export interface RegistrationDetails {
  reception_note?: string;
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
