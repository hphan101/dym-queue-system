import type { BranchCode } from '../../../types/domain';
import type { TT25RegistrationData } from '../tt25Types';
import type { RegistrationReceipt } from './registrationReceipt';

const STORAGE_KEY = 'dym_registration_edit_v1';
export const REGISTRATION_EDIT_WINDOW_MS = 10 * 60_000;

export type EditableRegistrationDetails = Pick<TT25RegistrationData,
  'fullName' | 'phoneNumber' | 'province' | 'ward' | 'addressDetail' | 'workplace'> & { email: string };

export interface CustomerEditSession {
  receipt: RegistrationReceipt;
  token: string;
  expiresAt: number;
}

export function readCustomerEditSession(branch: BranchCode | null, now = Date.now()): CustomerEditSession | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!branch || session?.receipt?.branch !== branch || typeof session.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(session.token) || !Number.isFinite(session.expiresAt) || session.expiresAt <= now ||
      typeof session.receipt.queueNumber !== 'string' || !/^\d{3,4}$/.test(session.receipt.queueNumber) ||
      typeof session.receipt.queueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.receipt.queueDate)) return null;
    return session;
  } catch {
    return null;
  }
}

export function storeCustomerEditSession(session: CustomerEditSession | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* The current tab can still use the session in memory. */ }
}
