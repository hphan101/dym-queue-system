import { createAdminClient, getSupabaseSecretKey } from "./supabase.ts";
import { createHmac, hashRegistrationSession, registrationFailureKind, SESSION_TOKEN_PATTERN, verifyExpiredQrChallenge } from "./registrationAccess.ts";

function completeWithCount(response: Response, write: Promise<unknown>): Response | Promise<Response> {
  // Reporting must never replace the original registration response.
  const settled = write.catch(() => {});
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime) {
    runtime.waitUntil(settled);
    return response;
  }
  return settled.then(() => response);
}

export function countSubmissionFailure(response: Response, branch: string, code: string, sessionToken: string) {
  const kind = registrationFailureKind(code);
  if (!kind || !["q1", "q7", "hn"].includes(branch) || !SESSION_TOKEN_PATTERN.test(sessionToken)) return response;
  const url = Deno.env.get("SUPABASE_URL");
  const secret = getSupabaseSecretKey();
  if (!url || !secret) return response;
  const write = async () => {
    const client = createAdminClient(url, secret);
    await client.rpc("record_registration_failure", {
      p_branch_code: branch, p_kind: kind, p_session_hash: await hashRegistrationSession(sessionToken),
    }).abortSignal(AbortSignal.timeout(1500));
  };
  return completeWithCount(response, write());
}

export function countExpiredQrFailure(response: Response, client: ReturnType<typeof createAdminClient>, branch: string,
  challenge: string, signingSecret: string, ip: string | null, now: number) {
  const count = async () => {
    if (await verifyExpiredQrChallenge(challenge, signingSecret, now) !== branch) return;
    const signal = AbortSignal.timeout(1500);
    const { data, error } = await client.rpc("consume_registration_ip_limit", {
      p_ip_hash: await createHmac(`expired-qr|${ip ?? "unknown"}`, signingSecret),
      p_max_requests: 120, p_window_seconds: 600,
    }).abortSignal(signal);
    const limit = Array.isArray(data) ? data[0] : data;
    if (error || !limit?.allowed) return;
    await client.rpc("record_registration_failure", {
      p_branch_code: branch, p_kind: "qr_expired", p_session_hash: null,
    }).abortSignal(signal);
  };
  return completeWithCount(response, count());
}
