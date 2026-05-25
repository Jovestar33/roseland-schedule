import { DEFAULT_ROW_ACTION, DEFAULT_ROW_COUNT } from './constants';
import type { ScheduleRow, ScheduleMeta } from './types';

export function makeRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    action: DEFAULT_ROW_ACTION,
    otherText: '',
    desc: '',
    loc: '',
    locLat: null,
    locLng: null,
    notes: '',
    status: '',
    contactName: '',
    contactTitle: '',
    contactPhone: '',
    contactEmail: '',
    timeIn: '',
    dur: '',
    done: false,
    sunLocked: false,
    fixedIn: false,
    fixedOut: false,
    fixedOutTime: '',
    // subLocations is optional — omitted from defaults so old schedules remain unchanged;
    // present in overrides spread when loaded from JSON that contains the field.
    ...overrides,
  };
}

export function makeMeta(overrides: Partial<ScheduleMeta> = {}): ScheduleMeta {
  return {
    town: '',
    date: '',
    prod: '',
    dir: '',
    dp: '',
    lat: null,
    lng: null,
    wx: null,
    projectName: '',
    phase: '',
    dayNumber: null,
    totalDays: null,
    ...overrides,
  };
}

// Coerce a partial/unknown row object (e.g. from JSON import) into a full ScheduleRow.
export function normalizeRow(raw: Partial<ScheduleRow>): ScheduleRow {
  return makeRow(raw);
}

export function normalizeRows(raws: Partial<ScheduleRow>[]): ScheduleRow[] {
  return raws.map(normalizeRow);
}

export function makeDefaultRows(count = DEFAULT_ROW_COUNT): ScheduleRow[] {
  return Array.from({ length: count }, () => makeRow({ action: '' }));
}
