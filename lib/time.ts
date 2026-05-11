import type { ScheduleRow } from './types';

// Parse 12-hour time string ("7:00 AM") to minutes since midnight. Returns -1 if invalid.
export function t12m(s: string): number {
  if (!s) return -1;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const pm = m[3].toUpperCase() === 'PM';
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return h * 60 + min;
}

// Convert minutes since midnight to 12-hour time string ("7:00 AM").
export function m12(v: number): string {
  if (v < 0) return '';
  const h24 = Math.floor(v / 60) % 24;
  const min = v % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

// Parse duration string ("1:30") to minutes. Returns 0 if invalid.
export function durm(s: string): number {
  if (!s) return 0;
  const m = s.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Format minutes as duration string ("1:30").
export function mDur(v: number): string {
  if (v <= 0) return '';
  const h = Math.floor(v / 60);
  const min = v % 60;
  return `${h}:${String(min).padStart(2, '0')}`;
}

// Compute the display Time Out for a single row (not stored in the row).
export function computeTimeOut(row: ScheduleRow): string {
  if (row.fixedOut && row.fixedOutTime) return row.fixedOutTime;
  const timeInMins = t12m(row.timeIn);
  const durMins = durm(row.dur);
  if (timeInMins < 0 || durMins <= 0) return '';
  return m12(timeInMins + durMins);
}

// Cascade time recalculation across all rows.
// Rules:
//   sunLocked  — timeIn is set externally (sunrise/sunset); cursor advances past it
//   fixedIn    — timeIn is user-pinned; cursor advances past it but incoming cascade skips it
//   fixedOut   — timeOut is user-pinned via fixedOutTime; dur is back-computed; cursor advances past it
//   default    — timeIn = previous timeOut; timeOut = timeIn + dur
export function recalcRows(rows: ScheduleRow[]): ScheduleRow[] {
  const result = rows.map((r) => ({ ...r }));
  let cursor = -1;

  for (const r of result) {
    if (r.sunLocked) {
      const mins = t12m(r.timeIn);
      if (mins >= 0) cursor = mins;
    } else if (r.fixedIn) {
      const mins = t12m(r.timeIn);
      if (mins >= 0) cursor = mins;
    } else if (cursor >= 0) {
      r.timeIn = m12(cursor);
    }

    const timeInMins = t12m(r.timeIn);

    if (r.fixedOut && r.fixedOutTime) {
      const fixedOutMins = t12m(r.fixedOutTime);
      if (fixedOutMins >= 0) {
        if (timeInMins >= 0 && fixedOutMins > timeInMins) {
          r.dur = mDur(fixedOutMins - timeInMins);
        }
        cursor = fixedOutMins;
      }
    } else {
      const durMins = durm(r.dur);
      if (timeInMins >= 0 && durMins > 0) {
        cursor = timeInMins + durMins;
      } else if (timeInMins >= 0) {
        cursor = timeInMins;
      }
    }
  }

  return result;
}
