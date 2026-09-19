import type {TemplateUse} from './schedule-templates.ts';
import type { ScheduleData } from '../types.ts';
import { ScheduleRepositoryError, type StoredSchedule } from './schedule-repository.ts';
import { captureSaveAttempt, saveMatches, type SaveAttempt, type SaveResult, type SaveRecoveryRepository } from './schedule-save-recovery.ts';

export interface EditorSnapshot { documentSession: number; editRevision: number; getScheduleData(): ScheduleData; templateUses?: TemplateUse[]; acknowledgeTemplateUses?(uses: readonly TemplateUse[]): void }
export interface LocalEditorStore {
  getState(): EditorSnapshot & { markClean(): void };
  load(record: StoredSchedule): void;
}

/** Owns actor, attempted document and request identity independently of React. */
export class LocalEditorController {
  private generation = 0;
  private busy = false;
  private actor: string | null = null;
  record: StoredSchedule | null = null;
  attempt: SaveAttempt | null = null;
  result: SaveResult | null = null;
  private repository: SaveRecoveryRepository;
  private store: LocalEditorStore;
  constructor(repository: SaveRecoveryRepository, store: LocalEditorStore) {
    this.repository = repository; this.store = store;
  }
  bind(actor: string) { if (actor !== this.actor) { this.invalidate(); this.actor = actor; } }
  invalidate() { this.close(); this.actor = null; }
  /** Discard document state and fence pending replies without signing out. */
  close() { this.generation++; this.record = null; this.attempt = null; this.result = null; this.busy = false; }
  /** Same-actor token changes invalidate callbacks, retaining any possibly sent attempt. */
  suspend() { this.generation++; this.busy = false; }
  private current(attempt: SaveAttempt, generation: number) {
    return generation === this.generation && attempt.actor === this.actor && this.attempt === attempt
      && this.store.getState().documentSession === attempt.documentSession;
  }
  private accept(attempt: SaveAttempt, result: SaveResult) {
    if (result.state !== 'matched' || !result.saved || !saveMatches(attempt,result.saved)
      || !Number.isSafeInteger(result.currentVersion) || result.currentVersion! < result.saved.document_version) throw new ScheduleRepositoryError('failed');
    this.record = result.saved;
    this.store.getState().acknowledgeTemplateUses?.(attempt.templateUses ?? []);
    // A later server version is never silently adopted or overwritten.
    if (result.currentVersion === result.saved.document_version) {
      if (this.store.getState().editRevision === attempt.editRevision) this.store.getState().markClean();
      this.attempt = null;
    }
  }
  async open(id: string) {
    if (this.busy) return false;
    if (!this.actor) throw new ScheduleRepositoryError('unauthenticated');
    const generation = ++this.generation;
    const {documentSession,editRevision} = this.store.getState();
    this.busy = true;
    try {
      const record = await this.repository.read(id), now = this.store.getState();
      if (generation !== this.generation || now.documentSession !== documentSession || now.editRevision !== editRevision) return false;
      this.store.load(record); this.record = record; this.attempt = null; this.result = null;
      return true;
    } catch (error) { if (generation === this.generation) throw error; return false; }
    finally { if (generation === this.generation) this.busy = false; }
  }
  async save() {
    if (this.busy || !this.record || this.attempt) return false;
    if (!this.actor) throw new ScheduleRepositoryError('unauthenticated');
    const generation = this.generation, state = this.store.getState();
    const attempt = captureSaveAttempt({actor:this.actor,before:this.record,document:state.getScheduleData(),documentSession:state.documentSession,editRevision:state.editRevision,templateUses:state.templateUses});
    this.attempt = attempt; this.result = null; this.busy = true;
    try {
      const saved = await this.repository.send(attempt);
      if (!this.current(attempt,generation)) return false;
      this.accept(attempt,{state:'matched',saved,currentVersion:saved.document_version});
      return true;
    } catch (error) {
      if (!this.current(attempt,generation)) return false;
      // A definitive input rejection allows correction; transport uncertainty does not.
      if (error instanceof ScheduleRepositoryError && error.kind === 'invalid') this.attempt = null;
      throw error;
    } finally { if (generation === this.generation) this.busy = false; }
  }
  async resumeTemplateEditing() {
    if (this.busy || !this.attempt?.templateUses?.length || this.result?.state !== 'retryable') return false;
    const attempt = this.attempt, generation = this.generation;
    this.busy = true;
    try {
      const result = await this.repository.probe(attempt);
      if (!this.current(attempt,generation)) return false;
      if (result.state === 'matched') this.accept(attempt,result);
      this.result = result;
      if (result.state !== 'retryable' || result.saved !== null || result.currentVersion !== attempt.before.document_version) return false;
      // Keep the draft and its restrictions. A later save still uses the original
      // optimistic version, so an in-flight old save cannot be overwritten.
      this.attempt = null; this.result = null;
      return true;
    } finally { if (generation === this.generation) this.busy = false; }
  }
  async recover(retry = false) {
    if (this.busy || !this.attempt || (retry && this.result?.state !== 'retryable')) return false;
    const attempt = this.attempt, generation = this.generation;
    if (attempt.actor !== this.actor) throw new ScheduleRepositoryError('unauthenticated');
    this.result = null; this.busy = true;
    try {
      let result = await this.repository.probe(attempt);
      if (!this.current(attempt,generation)) return false;
      if (result.state === 'retryable' && (result.saved !== null || result.currentVersion !== attempt.before.document_version)) throw new ScheduleRepositoryError('failed');
      if (retry && result.state === 'retryable') {
        const saved = await this.repository.send(attempt);
        if (!this.current(attempt,generation)) return false;
        result = {state:'matched',saved,currentVersion:saved.document_version};
      }
      if (result.state === 'matched') this.accept(attempt,result);
      this.result = result;
      return true;
    } catch (error) { if (this.current(attempt,generation)) throw error; return false; }
    finally { if (generation === this.generation) this.busy = false; }
  }
}
