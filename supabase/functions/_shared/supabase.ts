import { createClient } from "npm:@supabase/supabase-js@2";

export function createAdminClient(supabaseUrl: string, secretKey: string) {
  const adminFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);

    // Opaque sb_secret keys belong in `apikey`; they are not JWT bearer tokens.
    if (headers.get("authorization") === `Bearer ${secretKey}`) {
      headers.delete("authorization");
    }

    return fetch(input, { ...init, headers });
  };

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: adminFetch },
  });
}
