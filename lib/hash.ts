import type { ScheduleData } from './types';

// Deterministic 32-bit hash of schedule content (meta + rows, excluding savedAt).
// Used for conflict detection: two saves are in conflict if their hashes differ.
export function hashSchedule(data: ScheduleData): string {
  const str = JSON.stringify({ meta: data.meta, rows: data.rows });
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function schedulesMatch(a: ScheduleData, b: ScheduleData): boolean {
  return hashSchedule(a) === hashSchedule(b);
}
