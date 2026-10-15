import type { BranchCode } from '../../types/domain';

export type { BranchCode } from '../../types/domain';

export interface RegistrationData {
  branch: BranchCode;
  fullName: string;
  phoneNumber: string;
  birthDate: string;
  gender: 'Nam' | 'Nữ';
  cccd: string;
  province: string;
  ward: string;
  addressDetail: string;
  companyName: string;
  /** Hidden anti-spam field; bots that fill it are rejected/faked */
  honeypot?: string;
}

export interface RegistrationResponse {
  success: boolean;
  queueNumber?: string;
  error?: string;
}

export * from './tt25Types';
export * from './tt25Constants';
