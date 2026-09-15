import { parseInvitationId } from './contracts.ts';
export type AcceptanceFailure = 'auth' | 'unavailable' | 'unknown';
export class AcceptanceError extends Error {
  kind: AcceptanceFailure;
  constructor(kind: AcceptanceFailure) { super(kind); this.kind = kind; }
}
export type AcceptanceAttempt = Readonly<{ actor: string; invitationId: string }>;
export type AcceptanceReceipt = Readonly<{ invitationId: string; organizationId: string; acceptedAt: string | null }>;
export interface AcceptanceRepository {
  accept(attempt: AcceptanceAttempt): Promise<string>;
  receipt(attempt: AcceptanceAttempt): Promise<AcceptanceReceipt | null>;
}
export class AcceptanceController {
  actor: string | null = null;
  attempt: AcceptanceAttempt | null = null;
  receipt: AcceptanceReceipt | null = null;
  phase: 'review' | 'pending' | 'uncertain' | 'unavailable' | 'success' = 'review';
  failure: AcceptanceFailure | null = null;
  busy = false;
  private generation = 0;
  bind(actor: string | null) { if (actor !== this.actor) { this.clear(); this.actor = actor; } }
  clear() { this.generation++; this.attempt = null; this.receipt = null; this.phase = 'review'; this.failure = null; this.busy = false; }
  prepare(id: string) {
    if (!this.actor || this.attempt) throw new Error('Finish the current review first');
    this.attempt = Object.freeze({ actor: this.actor, invitationId: parseInvitationId(id.trim()) });
  }
  async execute(repository: AcceptanceRepository, checkOnly = false) {
    if (!this.attempt || this.busy || this.phase === 'success') return;
    const attempt = this.attempt, generation = this.generation, prior = this.phase;
    this.busy = true; this.failure = null; this.phase = 'pending';
    try {
      let receipt: AcceptanceReceipt | null = null;
      // A retry checks for the prior committed result before another single-use RPC.
      if (checkOnly || prior !== 'review') receipt = await repository.receipt(attempt);
      if (generation !== this.generation) return;
      if (receipt && (receipt.invitationId !== attempt.invitationId || !receipt.acceptedAt || !Number.isFinite(Date.parse(receipt.acceptedAt)))) throw new AcceptanceError('unknown');
      if (!receipt && !checkOnly) receipt = { invitationId: attempt.invitationId, organizationId: parseInvitationId(await repository.accept(attempt)), acceptedAt: null };
      if (generation !== this.generation) return;
      if (receipt) { parseInvitationId(receipt.organizationId); this.receipt = Object.freeze({ ...receipt }); this.phase = 'success'; }
      else this.phase = prior === 'review' ? 'review' : prior === 'unavailable' ? 'unavailable' : 'uncertain';
    } catch (error) {
      if (generation !== this.generation) return;
      this.failure = error instanceof AcceptanceError ? error.kind : 'unknown';
      this.phase = this.failure === 'unavailable' ? 'unavailable' : 'uncertain';
    } finally { if (generation === this.generation) this.busy = false; }
  }
}
