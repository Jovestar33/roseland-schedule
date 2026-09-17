import type { ScheduleData } from '../types';
import { listSchedules, postLoad } from './load';
import { postSave } from './save';

import { parseScheduleBackup, type BackupSchedule } from '../schedule-backup-format';
export { parseScheduleBackup } from '../schedule-backup-format';
export type { BackupSchedule } from '../schedule-backup-format';

export async function exportScheduleBackup(token: string) {
  const names = await listSchedules(token);
  const schedules: BackupSchedule[] = [];
  for (const name of names) {
    const data = await postLoad(name, token);
    if (!data) throw new Error(`Could not read ${name}. No backup was downloaded; try again.`);
    schedules.push({ name, data });
  }
  return { format: 'roseland-schedules', version: 1, exportedAt: new Date().toISOString(), schedules };
}

export async function importScheduleBackup(entries: BackupSchedule[], token: string) {
  // Validate the entire selection before the first write; imported schedules
  // always use create-only writes. Partial network failures are reported by name.
  parseScheduleBackup(JSON.stringify({ format: 'roseland-schedules', version: 1, schedules: entries }), '');
  const imported: string[] = [], failed: { name: string; reason: string }[] = [];
  for (const entry of entries) {
    try { await postSave(entry.name, entry.data, token, { createOnly: true }); imported.push(entry.name); }
    catch (error) { failed.push({ name: entry.name, reason: error instanceof Error ? error.message : 'Import failed' }); }
  }
  return { imported, failed };
}
