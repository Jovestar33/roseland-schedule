// Target Supabase adapter. Supply a user-session client, never a service-role
// client. This module is intentionally not connected to the current editor.
import type { ScheduleData } from '../types.ts';

export interface StoredSchedule {
  id: string;
  organization_id: string;
  production_id: string;
  production_day_id: string;
  display_name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  archived_from_status: 'draft' | 'published' | null;
  deleted_at: string | null;
  document_schema_version: number;
  document_version: number;
  document: Partial<ScheduleData>;
  updated_at: string;
  updated_by: string;
}

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export interface ScheduleRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type ScheduleFailure = 'invalid' | 'unauthenticated' | 'unavailable' | 'conflict' | 'failed';
export class ScheduleRepositoryError extends Error {
  kind: ScheduleFailure;
  constructor(kind: ScheduleFailure) {
    const messages: Record<ScheduleFailure, string> = {
      invalid: 'Invalid schedule request', unauthenticated: 'Sign in to continue',
      unavailable: 'Schedule unavailable', conflict: 'Schedule changed; reload before saving',
      failed: 'Schedule request failed',
    };
    super(messages[kind]);
    this.name = 'ScheduleRepositoryError';
    this.kind = kind;
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!uuid.test(id)) throw new ScheduleRepositoryError('invalid');
}

export type ScheduleLifecycle = 'rename' | 'archive' | 'unarchive' | 'delete' | 'restore' | 'restore_version';
function assertVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
    throw new ScheduleRepositoryError('invalid');
  }
}
export interface ScheduleRepository {
  read(id: string): Promise<StoredSchedule>;
  readDeleted(id: string): Promise<StoredSchedule>;
  create(id: string, dayId: string, name: string, slug: string, document: unknown, schemaVersion: number): Promise<StoredSchedule>;
  mutate(id: string, expectedVersion: number, operation: ScheduleLifecycle, payload?: Record<string, unknown>): Promise<StoredSchedule>;
  update(id: string, expectedVersion: number, document: unknown, schemaVersion: number): Promise<StoredSchedule>;
}

export function createScheduleRepository(client: ScheduleRpcClient): ScheduleRepository {
  async function invoke(name: string, args: Record<string, unknown>): Promise<StoredSchedule> {
    let result: RpcResult;
    try { result = await client.rpc(name, args); }
    catch { throw new ScheduleRepositoryError('failed'); }
    if (result.error) {
      const kinds: Record<string, ScheduleFailure> = {
        PT400: 'invalid', PT401: 'unauthenticated', PGRST301: 'unauthenticated', PGRST303: 'unauthenticated',
        PT404: 'unavailable', '42501': 'unavailable', PT409: 'conflict',
      };
      throw new ScheduleRepositoryError(kinds[result.error.code ?? ''] ?? 'failed');
    }
    // Reject a partial/malformed acknowledgement rather than mark a save clean.
    const data = result.data as StoredSchedule | null;
    if (!data || data.id !== args.target_schedule_id || !Number.isSafeInteger(data.document_version)
      || data.document_version < 1 || data.document_schema_version !== 1
      || !data.document || !Array.isArray(data.document.rows)
      || !data.document.meta || typeof data.document.meta !== 'object' || Array.isArray(data.document.meta)
      || ![data.organization_id, data.production_id, data.production_day_id, data.updated_by].every(value => typeof value === 'string' && uuid.test(value))
      || typeof data.slug !== 'string' || !['draft','published','archived'].includes(data.status)
      || ![null,'draft','published'].includes(data.archived_from_status)
      || !(data.deleted_at === null || (typeof data.deleted_at === 'string' && Number.isFinite(Date.parse(data.deleted_at))))
      || typeof data.display_name !== 'string' || typeof data.updated_at !== 'string' || !Number.isFinite(Date.parse(data.updated_at))) {
      throw new ScheduleRepositoryError('failed');
    }
    if ('expected_version' in args && data.document_version !== Number(args.expected_version) + 1) {
      throw new ScheduleRepositoryError('failed');
    }
    if (name === 'create_schedule' && (data.document_version !== 1 || data.production_day_id !== args.target_day_id)) {
      throw new ScheduleRepositoryError('failed');
    }
    return data;
  }
  return {
    read(id) {
      assertId(id);
      return invoke('read_schedule', { target_schedule_id: id });
    },
    readDeleted(id) {
      assertId(id);
      return invoke('read_deleted_schedule', { target_schedule_id: id });
    },
    create(id, dayId, name, slug, document, schemaVersion) {
      assertId(id); assertId(dayId);
      if (schemaVersion !== 1) throw new ScheduleRepositoryError('invalid');
      return invoke('create_schedule', { target_schedule_id: id, target_day_id: dayId,
        next_display_name: name, next_slug: slug, next_document: document, schema_version: schemaVersion });
    },
    mutate(id, expectedVersion, operation, payload = {}) {
      assertId(id); assertVersion(expectedVersion);
      if (!['rename','archive','unarchive','delete','restore','restore_version'].includes(operation)) {
        throw new ScheduleRepositoryError('invalid');
      }
      return invoke('mutate_schedule', { target_schedule_id: id, expected_version: expectedVersion, operation, payload });
    },
    update(id, expectedVersion, document, schemaVersion) {
      assertId(id);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1
        || expectedVersion >= Number.MAX_SAFE_INTEGER || schemaVersion !== 1) {
        throw new ScheduleRepositoryError('invalid');
      }
      // SQL is the authoritative document validator, including direct RPC callers.
      return invoke('update_schedule_document', {
        target_schedule_id: id, expected_version: expectedVersion,
        next_document: document, schema_version: schemaVersion,
      });
    },
  };
}
