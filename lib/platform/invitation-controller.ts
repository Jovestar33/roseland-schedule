import { parseCreateInvitationInput, parseInvitationId, parseRevokeInvitationInput } from './contracts.ts';

export type RequestKind = 'create' | 'revoke';
export type FailureKind = 'auth' | 'mfa' | 'denied' | 'rate' | 'conflict' | 'unknown';
export class InvitationError extends Error {
  kind: FailureKind;
  constructor(kind: FailureKind) { super(kind); this.name = 'InvitationError'; this.kind = kind; }
}
export type InvitationAttempt = Readonly<{
  key: string; actor: string; organization: string; kind: RequestKind;
  target: string | null; body: Readonly<Record<string, unknown>>;
}>;
export type AttemptPhase = 'review' | 'pending' | 'unknown' | 'blocked' | 'conflict' | 'success';
export interface CheckedResult { id: string; matches: boolean; description: string }

/** An operation is one actor, one immutable body and one key, across retries. */
export class InvitationController {
  actor: string | null = null;
  attempt: InvitationAttempt | null = null;
  phase: AttemptPhase = 'review';
  failure: FailureKind | null = null;
  result: CheckedResult | null = null;
  busy = false;
  private generation = 0;
  private makeKey: () => string;
  constructor(makeKey: () => string) { this.makeKey = makeKey; }
  bind(actor: string | null) {
    if (actor !== this.actor) { this.clear(); this.actor = actor; }
  }
  clear() {
    this.generation++; this.attempt = null; this.result = null;
    this.phase = 'review'; this.failure = null; this.busy = false;
  }
  prepare(kind: RequestKind, organization: string, body: unknown, target: string | null = null) {
    if (!this.actor || this.attempt) throw new Error('Finish the current request first');
    const normalized = kind === 'create' ? parseCreateInvitationInput(body) : parseRevokeInvitationInput(body);
    if (kind === 'create' && 'organizationId' in normalized && normalized.organizationId !== organization) throw new Error('Organization mismatch');
    this.attempt = Object.freeze({ key: this.makeKey(), actor: this.actor, organization: parseInvitationId(organization), kind,
      target: kind === 'revoke' ? parseInvitationId(target) : null, body: Object.freeze({ ...normalized }) });
    this.phase = 'review'; this.failure = null; this.result = null;
  }
  async submit(send: (attempt: InvitationAttempt) => Promise<string>) {
    if (!this.attempt || this.busy || this.phase === 'success' || this.phase === 'conflict') return;
    const generation = this.generation, attempt = this.attempt;
    this.busy = true; this.phase = 'pending'; this.failure = null;
    try {
      const id = parseInvitationId(await send(attempt));
      if (attempt.kind === 'revoke' && id !== attempt.target) throw new InvitationError('unknown');
      if (generation !== this.generation) return;
      this.result = { id, matches: true, description: attempt.kind === 'create' ? 'Invitation created.' : 'Invitation revoked.' };
      this.phase = 'success';
    } catch (error) {
      if (generation !== this.generation) return;
      this.failure = error instanceof InvitationError ? error.kind : 'unknown';
      this.phase = this.failure === 'conflict' ? 'conflict' : this.failure === 'unknown' ? 'unknown' : 'blocked';
    } finally { if (generation === this.generation) this.busy = false; }
  }
  async check(find: (attempt: InvitationAttempt) => Promise<CheckedResult | null>) {
    if (!this.attempt || this.busy) return;
    const generation = this.generation, attempt = this.attempt;
    this.busy = true;
    try {
      const result = await find(attempt);
      if (generation !== this.generation) return;
      this.result = result;
      if (result?.matches && this.phase !== 'conflict') { this.phase = 'success'; this.failure = null; }
    } catch (error) {
      if (generation === this.generation) this.failure = error instanceof InvitationError ? error.kind : 'unknown';
    } finally { if (generation === this.generation) this.busy = false; }
  }
}
