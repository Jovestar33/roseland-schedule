import type { ScheduleRow } from './types';

// 15-minute interval time options for Time In / Time Out selectors (96 entries)
export const TIMES: string[] = Array.from({ length: 96 }, (_, i) => {
  const h24 = Math.floor((i * 15) / 60);
  const min = (i * 15) % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
});

// Common duration presets for the Duration selector
export const DURATIONS: string[] = [
  '00:15', '00:30', '00:45',
  '01:00', '01:15', '01:30', '01:45',
  '02:00', '02:30', '03:00', '03:30',
  '04:00', '04:30', '05:00', '06:00',
  '07:00', '08:00',
];

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

// Format minutes as duration string ("01:30").
export function mDur(v: number): string {
  if (v <= 0) return '';
  const h = Math.floor(v / 60);
  const min = v % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Compute the display Time Out for a single row (not stored in the row).
export function computeTimeOut(row: ScheduleRow): string {
  if (row.fixedOut && row.fixedOutTime) return row.fixedOutTime;
  const timeInMins = t12m(row.timeIn);
  const durMins = durm(row.dur);
  if (timeInMins < 0 || durMins <= 0) return '';
  return m12(timeInMins + durMins);
}

// Find the next downstream fixed anchor (fixedIn or fixedOut) after row i.
// Stops if a row has no duration (cascade can't propagate past it).
export function nextFixedAnchorMin(
  rows: ScheduleRow[],
  i: number,
): { idx: number; type: 'in' | 'out'; min: number } | null {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[j].sunLocked) continue;
    if (rows[j].fixedIn && rows[j].timeIn) {
      const min = t12m(rows[j].timeIn);
      if (min >= 0) return { idx: j, type: 'in', min };
    }
    if (rows[j].fixedOut && rows[j].fixedOutTime) {
      const min = t12m(rows[j].fixedOutTime);
      if (min >= 0) return { idx: j, type: 'out', min };
    }
    if (!rows[j].dur) break;
  }
  return null;
}

export type ConflictInfo = { kind: string; msg: string };
export type GapInfo = { kind: 'gap' | 'overlap'; minutes: number; msg: string };

// Detect duration conflicts: overrun, fixedOut mismatch, negative duration.
export function rowConflictInfo(rows: ScheduleRow[], i: number): ConflictInfo | null {
  const r = rows[i];
  if (!r || r.sunLocked) return null;

  // Natural (duration-only) time out — ignoring fixedOut override
  const tim = t12m(r.timeIn);
  const dur = durm(r.dur);
  const naturalOut = tim >= 0 && dur > 0 ? m12(tim + dur) : '';
  const natm = t12m(naturalOut);

  if (r.fixedOut && r.fixedOutTime && naturalOut && naturalOut !== r.fixedOutTime) {
    return { kind: 'fixedOutMismatch', msg: `Duration implies ${naturalOut}; fixed out is ${r.fixedOutTime}.` };
  }
  const next = nextFixedAnchorMin(rows, i);
  if (next && natm >= 0 && natm > next.min) {
    return { kind: 'overrun', msg: `Pushes past fixed ${next.type === 'in' ? 'Time In' : 'Time Out'} on row ${next.idx + 1}.` };
  }
  if (r.fixedOut && r.fixedOutTime && tim >= 0) {
    const out = t12m(r.fixedOutTime);
    if (out >= 0 && out < tim) return { kind: 'negative', msg: 'Fixed Time Out is earlier than Time In.' };
  }
  return null;
}

// Return the filtered DURATIONS list — exclude options that overrun the next fixed anchor.
export function allowedDurationsForRow(rows: ScheduleRow[], i: number): string[] {
  const r = rows[i];
  if (!r || r.sunLocked) return DURATIONS;

  const tim = t12m(r.timeIn);
  if (tim < 0) return DURATIONS;

  let max: number | null = null;

  if (r.fixedOut && r.fixedOutTime) {
    const out = t12m(r.fixedOutTime);
    if (out >= 0 && out >= tim) max = out - tim;
  }

  const next = nextFixedAnchorMin(rows, i);
  if (next && next.min >= tim) {
    const diff = next.min - tim;
    max = max === null ? diff : Math.min(max, diff);
  }

  if (max === null) return DURATIONS;
  return DURATIONS.filter(d => !d || durm(d) <= max!);
}

// Detect a gap or overlap between this fixedIn row and the previous row's computed time out.
// Only applies to fixedIn rows (not the first editable row — that's the call-time anchor).
export function rowGapInfo(rows: ScheduleRow[], i: number): GapInfo | null {
  const r = rows[i];
  if (!r || r.sunLocked || !r.fixedIn || !r.timeIn) return null;

  const firstNonSun = rows.findIndex((x) => !x.sunLocked);
  if (i === firstNonSun) return null;

  let prev: ScheduleRow | null = null;
  for (let j = i - 1; j >= 0; j--) {
    if (!rows[j].sunLocked) { prev = rows[j]; break; }
  }
  if (!prev) return null;

  const prevOut = computeTimeOut(prev);
  if (!prevOut) return null;

  const prevOutM = t12m(prevOut);
  const thisInM  = t12m(r.timeIn);
  if (prevOutM < 0 || thisInM < 0) return null;

  const diff = thisInM - prevOutM;
  if (diff === 0) return null;
  if (diff > 0) return { kind: 'gap',     minutes: diff,  msg: `${diff}-min gap after previous row.`       };
  return           { kind: 'overlap', minutes: -diff, msg: `Overlaps previous row by ${-diff} min.` };
}

// A row is "locked" when the previous non-sun row has no duration (cascade can't flow into it).
// The first non-sun row and fixedIn rows are never locked.
export function isLocked(rows: ScheduleRow[], i: number): boolean {
  const r = rows[i];
  if (!r || r.sunLocked || r.fixedIn) return false;
  const firstNonSun = rows.findIndex(r => !r.sunLocked);
  if (i === firstNonSun) return false;
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].sunLocked) continue;
    return !rows[j].dur;
  }
  return false;
}

// Cascade time recalculation across all rows.
// Rules:
//   sunLocked        — timeIn is set externally (sunrise/sunset); cursor advances past it
//   fixedIn          — timeIn is user-pinned; cursor advances past it but incoming cascade skips it
//   first editable   — treated like fixedIn: call time is owned by the user, never overwritten
//   fixedOut         — timeOut is user-pinned via fixedOutTime; dur is back-computed; cursor advances past it
//   default          — timeIn = previous timeOut; timeOut = timeIn + dur
export function recalcRows(rows: ScheduleRow[]): ScheduleRow[] {
  const result = rows.map((r) => ({ ...r }));
  let cursor = -1;
  let firstEditableSeen = false;

  for (const r of result) {
    if (r.sunLocked) {
      const mins = t12m(r.timeIn);
      if (mins >= 0) cursor = mins;
    } else if (r.fixedIn || !firstEditableSeen) {
      // First editable row is always the call-time anchor — never overwritten by cascade
      firstEditableSeen = true;
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
