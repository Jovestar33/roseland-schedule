import type { ScheduleData } from '../types.ts';
import type { StoredSchedule } from './schedule-repository.ts';
import type { SessionScheduleRepository } from './session-schedule-repository.ts';

export interface EditorSnapshot { documentSession: number; editRevision: number; getScheduleData(): ScheduleData }
export interface LocalEditorStore {
  getState(): EditorSnapshot & { markClean(): void };
  load(record: StoredSchedule): void;
}

/** Owns request identity independently of React render timing. */
export class LocalEditorController {
  private generation = 0;
  private busy = false;
  record: StoredSchedule | null = null;
  private repository: Pick<SessionScheduleRepository, 'read' | 'update'>;
  private store: LocalEditorStore;
  constructor(repository: Pick<SessionScheduleRepository, 'read' | 'update'>, store: LocalEditorStore) {
    this.repository = repository; this.store = store;
  }
  invalidate() { this.generation++; this.record = null; this.busy = false; }
  async open(id: string) {
    if (this.busy) return false;
    const generation = ++this.generation;
    const { documentSession, editRevision } = this.store.getState();
    this.busy = true;
    try {
      const record = await this.repository.read(id);
      const now = this.store.getState();
      if (generation !== this.generation || now.documentSession !== documentSession || now.editRevision !== editRevision) return false;
      this.store.load(record);
      this.record = record;
      return true;
    } catch (error) { if (generation === this.generation) throw error; return false; }
    finally { if (generation === this.generation) this.busy = false; }
  }
  async save() {
    if (this.busy || !this.record) return false;
    const generation = this.generation;
    const { documentSession, editRevision } = this.store.getState();
    const record = this.record;
    this.busy = true;
    try {
      const saved = await this.repository.update(record.id, record.document_version, this.store.getState().getScheduleData(), record.document_schema_version);
      const now = this.store.getState();
      if (generation !== this.generation || now.documentSession !== documentSession) return false;
      // Advance the baseline even if newer local edits arrived, but leave those dirty.
      this.record = saved;
      if (now.editRevision === editRevision) now.markClean();
      return true;
    } catch (error) { if (generation === this.generation) throw error; return false; }
    finally { if (generation === this.generation) this.busy = false; }
  }
}
