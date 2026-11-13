import type { BranchCode } from '../../types/domain';

export class RegistrationAccessError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface QrChallenge {
  branch: BranchCode;
  challenge: string;
  expiresAt: string;
  refreshAt: string;
  serverNow: string;
}

export interface AccessSessionResponse {
  branch: BranchCode;
  sessionToken: string;
  expiresAt: string;
  serverNow: string;
}

export async function requestRegistrationAccess<T>(
  body: { action: 'qr' | 'exchange'; branch: BranchCode; challenge?: string; purpose?: 'staff' },
  signal: AbortSignal,
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/registration-access`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (response.status === 404) throw new RegistrationAccessError('QR_SERVICE_NOT_DEPLOYED');
  if (!response.ok || !result?.success) throw new RegistrationAccessError(result?.code ?? 'SERVER_ERROR');
  return result as T;
}
