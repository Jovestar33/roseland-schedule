import { parseIdempotencyKey, parseInvitationId, parseProvisionOrganizationInput, type ProvisionOrganizationInput } from './contracts.ts';
import { InvitationError, type FailureKind } from './invitation-controller.ts';
import type { Session } from '@supabase/supabase-js';

export type ProvisioningAttempt = Readonly<{ actor: string; key: string; body: Readonly<ProvisionOrganizationInput> }>;
export class ProvisioningController {
  actor: string|null = null;
  attempt: ProvisioningAttempt|null = null;
  result: string|null = null;
  failure: FailureKind|null = null;
  phase: 'review'|'pending'|'unknown'|'blocked'|'conflict'|'success' = 'review';
  busy = false;
  private generation = 0;
  private makeKey: () => string;
  constructor(makeKey: () => string) { this.makeKey = makeKey; }
  bind(actor: string|null) { if (actor !== this.actor) { this.clear(); this.actor = actor; } }
  clear() { this.generation++; this.attempt = null; this.result = null; this.failure = null; this.phase = 'review'; this.busy = false; }
  prepare(input: unknown) {
    if (!this.actor || this.attempt) throw new Error('Finish the current review first');
    const body = Object.freeze(parseProvisionOrganizationInput(input));
    this.attempt = Object.freeze({ actor: parseInvitationId(this.actor), key: parseIdempotencyKey(this.makeKey()), body });
  }
  async submit(send: (attempt: ProvisioningAttempt) => Promise<string>) {
    if (!this.attempt || this.busy || this.phase === 'success' || this.phase === 'conflict') return;
    const stamp = this.generation, attempt = this.attempt;
    this.busy = true; this.phase = 'pending'; this.failure = null;
    try {
      const id = parseInvitationId(await send(attempt));
      if (stamp !== this.generation) return;
      this.result = id; this.phase = 'success';
    } catch (error) {
      if (stamp !== this.generation) return;
      this.failure = error instanceof InvitationError ? error.kind : 'unknown';
      this.phase = this.failure === 'unknown' ? 'unknown' : this.failure === 'conflict' ? 'conflict' : 'blocked';
    } finally { if (stamp === this.generation) this.busy = false; }
  }
}

/** Exact retries use the existing canonical-input server ledger, never owner lookup. */
export async function sendProvisioningAttempt(attempt: ProvisioningAttempt, session: Session|null, request: typeof fetch = fetch): Promise<string> {
  if (!session || session.user.id !== attempt.actor) throw new InvitationError('auth');
  let response: Response;
  try {
    response = await request('/api/platform/organizations', {
      method: 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', 'idempotency-key': attempt.key },
      body: JSON.stringify(attempt.body), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new InvitationError('unknown'); }
  let body: { organizationId?: unknown; requestId?: unknown; error?: unknown };
  try { body = await response.json(); } catch { throw new InvitationError('unknown'); }
  if (!response.ok) {
    const kind = response.status === 401 ? 'auth' : response.status === 429 ? 'rate' : response.status === 409 ? 'conflict'
      : response.status === 403 && ['Recent authentication is required', 'Stronger authentication is required'].includes(String(body.error)) ? 'mfa'
      : [400,403,404,415].includes(response.status) ? 'denied' : 'unknown';
    throw new InvitationError(kind);
  }
  if (body.requestId !== attempt.key) throw new InvitationError('unknown');
  try { return parseInvitationId(body.organizationId); } catch { throw new InvitationError('unknown'); }
}
