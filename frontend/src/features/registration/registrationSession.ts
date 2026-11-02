import type { BranchCode } from '../../types/domain';

const STORAGE_KEY = 'dym_registration_access_v1';

export interface RegistrationSession {
  branch: BranchCode;
  token: string;
  expiresAt: number;
}

export function readRegistrationSession(branch: BranchCode, now = Date.now()): RegistrationSession | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.branch !== branch || typeof saved.token !== 'string' || !/^[a-f0-9]{64}$/.test(saved.token) ||
      !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now) return null;
    return saved;
  } catch {
    return null;
  }
}

export function storeRegistrationSession(session: RegistrationSession): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* The active session remains in memory. */ }
}

export function clearRegistrationSession(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Server verification still enforces one use. */ }
}
