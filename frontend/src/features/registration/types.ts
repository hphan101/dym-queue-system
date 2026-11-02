export type { BranchCode } from '../../types/domain';

export interface RegistrationResponse {
  success: boolean;
  code?: string;
  queueNumber?: string;
  queueDate?: string;
  error?: string;
}

export * from './tt25Types';
export * from './tt25Constants';
