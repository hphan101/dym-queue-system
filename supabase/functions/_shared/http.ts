const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function configuredOrigins(): string[] {
  return (
    Deno.env.get("ALLOWED_ORIGINS")
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

function wildcardOriginMatches(origin: string, rule: string): boolean {
  if (!rule.includes("*")) return origin === rule;

  const escapedRule = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^.]*");

  return new RegExp(`^${escapedRule}$`).test(origin);
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;

  // 1. If explicit ALLOWED_ORIGINS are configured, enforce them first
  const configured = configuredOrigins();
  if (configured.length > 0) {
    if (configured.some((rule) => wildcardOriginMatches(origin, rule))) {
      return true;
    }
    // Always allow localhost loopback for local Vite development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
    return false;
  }

  // 2. Fallback when ALLOWED_ORIGINS is not set (local/dev environment)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true;
  }

  if (
    /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i
      .test(origin)
  ) {
    return true;
  }

  if (
    /^https?:\/\/([a-z0-9-]+\.)*(loca\.lt|trycloudflare\.com|ngrok-free\.app|ngrok\.io|vercel\.app)(:\d+)?$/i
      .test(origin)
  ) {
    return true;
  }

  return DEFAULT_ALLOWED_ORIGINS.some((rule) =>
    wildcardOriginMatches(origin, rule)
  );
}

export function getClientIp(request: Request): string | null {
  // Prioritize Cloudflare's edge-verified header on Supabase Edge Functions.
  // Only fall back to the rightmost X-Forwarded-For hop when cf-connecting-ip is absent.
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && /^[0-9a-fA-F:.]{3,64}$/.test(cfIp)) {
    return cfIp.toLowerCase();
  }

  const forwardedParts = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const lastForwarded = forwardedParts?.at(-1);
  if (lastForwarded && /^[0-9a-fA-F:.]{3,64}$/.test(lastForwarded)) {
    return lastForwarded.toLowerCase();
  }

  return null;
}

export function responseHeaders(origin: string | null): Headers {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Vary", "Origin");

  if (origin && isOriginAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, content-type, apikey, x-client-info",
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return headers;
}

export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = responseHeaders(origin);
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(name, value);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
export const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeText(value: string, min: number, max: number): boolean {
  return (
    value.length >= min &&
    value.length <= max &&
    !CONTROL_CHARACTERS.test(value)
  );
}

