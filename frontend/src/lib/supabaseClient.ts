import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase client chưa được cấu hình.');
}

try {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  window.localStorage.removeItem(`sb-${projectRef}-auth-token`);
} catch {
  // Storage may be unavailable in hardened browser modes.
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.sessionStorage,
    storageKey: 'dym-staff-auth',
  },
});
