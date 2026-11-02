export const QR_ROTATION_MS = 60_000;
export const QR_VALIDITY_MS = 90_000;
export const REGISTRATION_SESSION_MS = 20 * 60_000;
export const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

export async function createQrChallenge(branch: string, secret: string, now = Date.now()) {
  const bucket = Math.floor(now / QR_ROTATION_MS);
  const message = `registration-qr|v1|${branch}|${bucket}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(message));
  return {
    challenge: `v1.${branch}.${bucket}.${hex(signature)}`,
    expiresAt: new Date(bucket * QR_ROTATION_MS + QR_VALIDITY_MS).toISOString(),
    refreshAt: new Date((bucket + 1) * QR_ROTATION_MS).toISOString(),
    serverNow: new Date(now).toISOString(),
  };
}

export async function verifyQrChallenge(challenge: string, secret: string, now = Date.now()): Promise<string | null> {
  const match = /^v1\.(q1|q7|hn)\.([0-9]{1,12})\.([a-f0-9]{64})$/.exec(challenge);
  if (!match) return null;
  const [, branch, rawBucket, signature] = match;
  const startsAt = Number(rawBucket) * QR_ROTATION_MS;
  if (now < startsAt || now >= startsAt + QR_VALIDITY_MS) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, (value) => Number.parseInt(value, 16));
  const valid = await crypto.subtle.verify(
    "HMAC", await hmacKey(secret), bytes,
    new TextEncoder().encode(`registration-qr|v1|${branch}|${rawBucket}`),
  );
  return valid ? branch : null;
}

export function createRegistrationSessionToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function hashRegistrationSession(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`registration-session|${token}`)));
}
