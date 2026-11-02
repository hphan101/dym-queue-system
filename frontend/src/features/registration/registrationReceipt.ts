import { getTodayInVietnam } from '../../lib/date';
import type { BranchCode } from '../../types/domain';

const STORAGE_KEY = 'dym_registration_receipt_v2';

export interface RegistrationReceipt {
  branch: BranchCode;
  queueDate: string;
  queueNumber: string;
}

export function readRegistrationReceipt(
  branch: BranchCode | null,
  today = getTodayInVietnam(),
): RegistrationReceipt | null {
  try {
    const receipt = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      !branch || receipt?.branch !== branch || receipt?.queueDate !== today ||
      typeof receipt?.queueNumber !== 'string' || !/^\d{4}$/.test(receipt.queueNumber)
    ) return null;
    return receipt;
  } catch {
    return null;
  }
}

export function storeRegistrationReceipt(receipt: RegistrationReceipt): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    // A storage failure must not turn a successful registration into an error.
  }
}

export function clearRegistrationReceipt(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The current receipt is also cleared from component state.
  }
}
