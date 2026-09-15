import { createScheduleRepository, ScheduleRepositoryError, type ScheduleRpcClient } from './schedule-repository.ts';

export interface ScheduleSummary {
  id: string; display_name: string; status: 'draft' | 'published' | 'archived'; document_version: number; updated_at: string;
}
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createSessionScheduleRepository(client: ScheduleRpcClient) {
  const repository = createScheduleRepository({
    rpc(name, args) {
      const names: Record<string, string> = { read_schedule: 'session_read_schedule', update_schedule_document: 'session_update_schedule_document' };
      if (!names[name]) throw new ScheduleRepositoryError('invalid');
      return client.rpc(names[name], args);
    },
  });
  return {
    read: repository.read,
    update: repository.update,
    async list(afterId: string | null = null, pageSize = 50): Promise<ScheduleSummary[]> {
      if ((afterId !== null && !idPattern.test(afterId)) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ScheduleRepositoryError('invalid');
      }
      let result;
      try { result = await client.rpc('session_list_schedules', { after_id: afterId, page_size: pageSize }); }
      catch { throw new ScheduleRepositoryError('failed'); }
      if (result.error) {
        const code = result.error.code;
        throw new ScheduleRepositoryError(code === 'PT401' || code === 'PGRST301' || code === 'PGRST303' ? 'unauthenticated'
          : code === 'PT400' ? 'invalid' : code === '42501' ? 'unavailable' : 'failed');
      }
      if (!Array.isArray(result.data) || result.data.length > pageSize) throw new ScheduleRepositoryError('failed');
      let previous = afterId?.toLowerCase() ?? '';
      for (const row of result.data) {
        if (!row || typeof row.id !== 'string' || !idPattern.test(row.id) || row.id.toLowerCase() <= previous
          || typeof row.display_name !== 'string' || !['draft','published','archived'].includes(row.status)
          || !Number.isSafeInteger(row.document_version) || row.document_version < 1
          || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new ScheduleRepositoryError('failed');
        previous = row.id.toLowerCase();
      }
      return result.data;
    },
  };
}
export type SessionScheduleRepository = ReturnType<typeof createSessionScheduleRepository>;
