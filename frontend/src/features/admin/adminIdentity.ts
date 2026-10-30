import { supabase } from '../../lib/supabaseClient';

const STAFF_NAME_STORAGE_KEY = 'dym-admin-staff-name';
const STAFF_NAME_FALLBACK = 'Tài khoản DYM';

let cachedStaffName = '';

export function getInitialStaffName() {
  if (cachedStaffName) return cachedStaffName;
  if (typeof window === 'undefined') return STAFF_NAME_FALLBACK;

  try {
    cachedStaffName =
      window.sessionStorage.getItem(STAFF_NAME_STORAGE_KEY)?.trim() || '';
  } catch {
    cachedStaffName = '';
  }

  return cachedStaffName || STAFF_NAME_FALLBACK;
}

export function rememberStaffName(value: unknown) {
  const nextName = String(value ?? '').trim();
  if (!nextName) return;

  cachedStaffName = nextName;
  try {
    window.sessionStorage.setItem(STAFF_NAME_STORAGE_KEY, nextName);
  } catch {
    // The in-memory cache still prevents a flash during SPA navigation.
  }
}

export function clearRememberedStaffName() {
  cachedStaffName = '';
  try {
    window.sessionStorage.removeItem(STAFF_NAME_STORAGE_KEY);
    window.sessionStorage.removeItem('dym_registration_overrides_v1');
    window.localStorage.removeItem('dym_registration_overrides_v1');
    window.localStorage.removeItem('dym_tt25_customer_extras_v1');
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

export async function signOutAdminSession() {
  await supabase.auth.signOut();
  clearRememberedStaffName();
  window.location.assign('/?page=login');
}
