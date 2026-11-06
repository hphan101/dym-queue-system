import { createClient } from "npm:@supabase/supabase-js@2";

function getDefaultKey(environmentName: string): string | null {
  const keys = Deno.env.get(environmentName);
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.length > 0) {
        return defaultKey;
      }
    } catch {
      console.error(JSON.stringify({ code: `INVALID_${environmentName}` }));
    }
  }

  return null;
}

export function getSupabaseSecretKey(): string | null {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || getDefaultKey("SUPABASE_SECRET_KEYS");
}

export function getSupabasePublishableKey(): string | null {
  return getDefaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? null;
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
