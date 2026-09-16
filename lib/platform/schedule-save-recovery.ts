import type { SupabaseClient } from '@supabase/supabase-js';
import { ScheduleRepositoryError, type StoredSchedule } from './schedule-repository.ts';
import { createSessionScheduleRepository } from './session-schedule-repository.ts';
import { createLifecycleRepository } from './schedule-lifecycle-repository.ts';
import { sameJson, type ScheduleHistory } from './schedule-lifecycle-controller.ts';

export interface SaveAttempt {
  readonly actor: string;
  readonly before: StoredSchedule;
  readonly document: StoredSchedule['document'];
  readonly documentSession: number;
  readonly editRevision: number;
}
export interface SaveResult {
  state: 'matched' | 'retryable' | 'different' | 'unavailable';
  saved: StoredSchedule | null;
  currentVersion: number | null;
}
export interface SaveRecoveryRepository {
  read(id: string): Promise<StoredSchedule>;
  send(attempt: SaveAttempt): Promise<StoredSchedule>;
  probe(attempt: SaveAttempt): Promise<SaveResult>;
}
export function captureSaveAttempt(value: SaveAttempt): SaveAttempt {
  const snapshot = structuredClone(value);
  const freeze = (object: unknown) => {
    if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); }
  };
  freeze(snapshot); return snapshot;
}
const metadataKeys = ['display_name','slug','production_day_id','status','archived_from_status','deleted_at'] as const;
function metadataMatches(before: StoredSchedule, metadata: Record<string, unknown>): boolean {
  return metadataKeys.every(key => metadata[key] === before[key]);
}
export function saveMatches(attempt: SaveAttempt, saved: StoredSchedule): boolean {
  const b = attempt.before;
  return !!saved && saved.id === b.id && saved.organization_id === b.organization_id && saved.production_id === b.production_id
    && saved.document_version === b.document_version + 1 && saved.document_schema_version === b.document_schema_version
    && saved.updated_by === attempt.actor && Number.isFinite(Date.parse(saved.updated_at))
    && sameJson(saved.document, attempt.document) && metadataMatches(b, saved as unknown as Record<string, unknown>);
}
export function savedFromHistory(attempt: SaveAttempt, history: ScheduleHistory | null): StoredSchedule | null {
  const b = attempt.before;
  if (!history || history.schedule_id !== b.id || history.organization_id !== b.organization_id || history.production_id !== b.production_id
    || history.version !== b.document_version + 1 || history.document_schema_version !== b.document_schema_version
    || history.created_by !== attempt.actor || !Number.isFinite(Date.parse(history.created_at))
    || !sameJson(history.document, attempt.document) || !history.metadata || !metadataMatches(b, history.metadata)) return null;
  return {...b, document:history.document, document_version:history.version, updated_at:history.created_at, updated_by:attempt.actor};
}
/** A matching immutable version proves saved state, not which network request caused it. */
export function createSaveRecoveryRepository(client: SupabaseClient, actor: () => string | null): SaveRecoveryRepository {
  const history = createLifecycleRepository(client);
  async function pinned(expected: string | null) {
    const r = await client.auth.getSession();
    if (!expected || actor() !== expected || r.error || r.data.session?.user.id !== expected) throw new ScheduleRepositoryError('unauthenticated');
    const token = r.data.session.access_token;
    return createSessionScheduleRepository({rpc:(name,args)=>client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`)});
  }
  return {
    async read(id) { return (await pinned(actor())).read(id); },
    async send(attempt) {
      const repo = await pinned(attempt.actor), b = attempt.before;
      const saved = await repo.update(b.id,b.document_version,attempt.document,b.document_schema_version);
      if (!saveMatches(attempt,saved)) throw new ScheduleRepositoryError('failed');
      return saved;
    },
    async probe(attempt) {
      const repo = await pinned(attempt.actor), b = attempt.before;
      let current: StoredSchedule;
      try { current = await repo.read(b.id); }
      catch (error) {
        if (error instanceof ScheduleRepositoryError && error.kind === 'unavailable') return {state:'unavailable',saved:null,currentVersion:null};
        throw error;
      }
      const inScope = (value: StoredSchedule) => value.id === b.id && value.organization_id === b.organization_id && value.production_id === b.production_id;
      if (!inScope(current) || current.document_version < b.document_version) throw new ScheduleRepositoryError('failed');
      const version = await history.historical(attempt.actor,b.organization_id,b.id,b.document_version+1);
      const saved = savedFromHistory(attempt,version);
      if (saved) {
        // The two reads are not a transaction snapshot. A concurrent commit may
        // make history newer than the first read; never use a lower current version.
        if (current.document_version < saved.document_version) current = await repo.read(b.id);
        if (!inScope(current) || current.document_version < saved.document_version
          || (current.document_version === saved.document_version && !saveMatches(attempt,current))) throw new ScheduleRepositoryError('failed');
        return {state:'matched',saved,currentVersion:current.document_version};
      }
      const baselineUnchanged = current.document_version === b.document_version && current.document_schema_version === b.document_schema_version
        && sameJson(current.document,b.document) && metadataMatches(b,current as unknown as Record<string,unknown>);
      return {state:baselineUnchanged && !version?'retryable':'different',saved:null,currentVersion:current.document_version};
    },
  };
}
