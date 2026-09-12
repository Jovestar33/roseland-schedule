import type { ScheduleData } from '../types';
import { listSchedules, postLoad } from './load';
import { postSave } from './save';

export interface BackupSchedule { name: string; data: ScheduleData }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validateSchedule(data: unknown): asserts data is ScheduleData {
  if (!object(data) || !object(data.meta) || !Array.isArray(data.rows) || data.rows.length > 5000) throw new Error('Invalid schedule: expected metadata and rows.');
  if (new TextEncoder().encode(JSON.stringify(data)).length > 2_000_000) throw new Error('A schedule exceeds the backup size limit.');
  const strings = 'action otherText desc loc locName locAddress notes status contactName contactTitle contactPhone contactEmail timeIn dur fixedOutTime'.split(' ');
  const booleans = 'done sunLocked fixedIn fixedOut'.split(' ');
  for (const row of data.rows) {
    if (!object(row)) throw new Error('Invalid schedule row.');
    for (const key of strings) if (row[key] !== undefined && typeof row[key] !== 'string') throw new Error(`Invalid row field: ${key}`);
    for (const key of booleans) if (row[key] !== undefined && typeof row[key] !== 'boolean') throw new Error(`Invalid row field: ${key}`);
    for (const key of ['locLat', 'locLng']) if (row[key] != null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) throw new Error(`Invalid coordinate: ${key}`);
    if (row.subLocations !== undefined && (!Array.isArray(row.subLocations) || row.subLocations.length > 1000 || row.subLocations.some(item => !object(item) || typeof item.loc !== 'string'))) throw new Error('Invalid sub-locations.');
    for (const item of (row.subLocations ?? []) as Record<string, unknown>[]) {
      for (const key of ['id', 'loc', 'desc', 'name', 'address']) if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid sub-location text.');
      for (const key of ['locLat', 'locLng']) if (item[key] != null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]))) throw new Error('Invalid sub-location coordinate.');
      if (item.done !== undefined && typeof item.done !== 'boolean') throw new Error('Invalid sub-location completion.');
    }
  }
  for (const key of 'town date prod dir dp projectName phase'.split(' ')) if (data.meta[key] !== undefined && typeof data.meta[key] !== 'string') throw new Error(`Invalid metadata: ${key}`);
  for (const key of ['lat', 'lng', 'dayNumber', 'totalDays']) if (data.meta[key] != null && (typeof data.meta[key] !== 'number' || !Number.isFinite(data.meta[key]))) throw new Error(`Invalid metadata number: ${key}`);
  for (const section of ['wx', 'callsheet']) {
    const nested = data.meta[section];
    if (nested == null) continue;
    if (!object(nested)) throw new Error(`Invalid metadata: ${section}`);
    for (const value of Object.values(nested)) if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`Invalid nested metadata: ${section}`);
  }
}

export function parseScheduleBackup(text: string, singleName: string): BackupSchedule[] {
  if (new TextEncoder().encode(text).length > 20_000_000) throw new Error('Backup exceeds 20 MB. Split it into smaller files.');
  const value: unknown = JSON.parse(text);
  if (!object(value)) throw new Error('Unrecognized backup format.');
  let entries: BackupSchedule[];
  if (value.format === 'roseland-schedules') {
    if (value.version !== 1 || !Array.isArray(value.schedules)) throw new Error('Unsupported backup version.');
    entries = value.schedules as BackupSchedule[];
  } else if (Array.isArray(value.rows)) {
    entries = [{ name: singleName, data: value as unknown as ScheduleData }];
  } else entries = Object.entries(value).map(([name, data]) => ({ name, data: data as ScheduleData }));
  if (!entries.length || entries.length > 500) throw new Error('Choose a backup containing 1–500 schedules.');
  const names = new Set<string>();
  for (const entry of entries) {
    if (!object(entry) || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200 || /[\x00-\x1f]/.test(entry.name)) throw new Error('Invalid schedule name.');
    if (names.has(entry.name)) throw new Error(`Duplicate backup name: ${entry.name}`);
    names.add(entry.name);
    validateSchedule(entry.data);
  }
  return entries;
}

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
