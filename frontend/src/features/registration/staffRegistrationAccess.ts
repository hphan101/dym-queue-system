import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { requestRegistrationAccess, RegistrationAccessError, type AccessSessionResponse, type QrChallenge } from './registrationAccessApi';

export async function requestStaffRegistrationSession(branch: BranchCode, signal: AbortSignal): Promise<AccessSessionResponse> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new RegistrationAccessError('AUTH_REQUIRED');
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role, is_active').eq('user_id', session.user.id).maybeSingle();
  if (profileError || !profile?.is_active || !['admin', 'receptionist'].includes(profile.role)) {
    throw new RegistrationAccessError('ACCESS_DENIED');
  }
  // The existing server authorizes the staff member and branch before signing
  // a challenge. Exchange it directly so staff do not need to scan a screen.
  const qr = await requestRegistrationAccess<QrChallenge>({ action: 'qr', branch }, signal, session.access_token);
  if (qr.branch !== branch) throw new RegistrationAccessError('ACCESS_DENIED');
  return requestRegistrationAccess<AccessSessionResponse>({ action: 'exchange', branch, challenge: qr.challenge }, signal);
}
