import { createClient } from "npm:@supabase/supabase-js@2";

export function getSupabaseSecretKey(): string | null {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey) return serviceRoleKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.length > 0) {
        return defaultKey;
      }
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_SECRET_KEYS" }));
    }
  }

  return null;
}

export function getSupabasePublishableKey(): string | null {
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.length > 0) {
        return defaultKey;
      }
    } catch {
      console.error(JSON.stringify({ code: "INVALID_SUPABASE_PUBLISHABLE_KEYS" }));
    }
  }

  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

export function createAdminClient(supabaseUrl: string, secretKey: string) {
  const adminFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);

    // Opaque sb_secret keys belong in `apikey`; they are not JWT bearer tokens.
    if (secretKey.startsWith("sb_secret_") && headers.get("authorization") === `Bearer ${secretKey}`) {
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
