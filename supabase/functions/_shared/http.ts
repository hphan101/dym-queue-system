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

function configuredOrigins(): Set<string> {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS,
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
  return Array.from(configuredOrigins()).some((rule) =>
    wildcardOriginMatches(origin, rule)
  );
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
