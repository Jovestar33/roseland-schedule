import { create } from 'zustand';
import { makeRow, makeMeta, normalizeRows } from '../rowNormalizer';
import { recalcRows, t12m, computeTimeOut } from '../time';
import { UNDO_LIMIT, DEFAULT_ROW_COUNT } from '../constants';
import type { ScheduleRow, ScheduleMeta, ScheduleData, WeatherData, SyncStatus, ConflictState } from '../types';

// After any row mutation, re-position sun-locked rows to their correct chronological slot.
function repositionSunRows(rows: ScheduleRow[], rowKeys: string[]): { rows: ScheduleRow[]; rowKeys: string[] } {
  const sunRows: ScheduleRow[] = [];
  const sunKeys: string[] = [];
  const cleanRows: ScheduleRow[] = [];
  const cleanKeys: string[] = [];

  rows.forEach((r, i) => {
    if (r.sunLocked) { sunRows.push(r); sunKeys.push(rowKeys[i]); }
    else             { cleanRows.push(r); cleanKeys.push(rowKeys[i]); }
  });

  if (sunRows.length === 0) return { rows: recalcRows(rows), rowKeys };

  const recalced = recalcRows(cleanRows);
  const times = recalced.map(r => ({ in: t12m(r.timeIn), out: t12m(computeTimeOut(r)) }));
  const hasT = times.some(t => t.in >= 0);

  function findPt(timeMin: number, isRise: boolean): { idx: number; note: string } {
    if (!hasT) return { idx: isRise ? 0 : 1, note: '' };
    const evtName = isRise ? 'Sunrise' : 'Sunset';
    for (let i = 0; i < times.length; i++) {
      const { in: inM, out: outM } = times[i];
      if (inM >= 0 && timeMin <= inM) return { idx: i, note: '' };
      if (inM >= 0 && outM >= 0 && timeMin > inM && timeMin < outM && recalced[i].action) {
        return { idx: i + 1, note: `${evtName} during: ${recalced[i].action}` };
      }
    }
    return { idx: recalced.length, note: '' };
  }

  const inserts = sunRows
    .map((row, i) => {
      const isRise = row.action.includes('Sunrise');
      const pt = findPt(t12m(row.timeIn), isRise);
      return { row: { ...row, desc: pt.note }, key: sunKeys[i], idx: pt.idx };
    })
    .sort((a, b) => b.idx - a.idx);

  const newRows = [...recalced];
  const newKeys = [...cleanKeys];
  inserts.forEach(({ row, key, idx }) => {
    newRows.splice(idx, 0, row);
    newKeys.splice(idx, 0, key);
  });

  return { rows: recalcRows(newRows), rowKeys: newKeys };
}

type Snapshot = { rows: ScheduleRow[]; meta: ScheduleMeta };

let keySeq = 0;
function newKey(): string { return `rk_${++keySeq}`; }
function cloneRows(rows: ScheduleRow[]): ScheduleRow[] { return rows.map(r => ({ ...r })); }

export interface ScheduleStore {
  rows: ScheduleRow[];
  rowKeys: string[];
  meta: ScheduleMeta;
  scheduleName: string | null;
  dirty: boolean;
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  syncStatus: SyncStatus;
  remoteBaseline: { savedAt: number; hash: string } | null;
  conflictData: ConflictState | null;

  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  updateRow: (index: number, patch: Partial<ScheduleRow>) => void;
  addRowAfter: (afterIndex: number) => void;
  deleteRow: (index: number) => void;
  reorderRows: (from: number, to: number) => void;
  updateMeta: (patch: Partial<ScheduleMeta>) => void;

  loadSchedule: (name: string, data: ScheduleData) => void;
  newSchedule: (name?: string) => void;
  markClean: () => void;
  getScheduleData: () => ScheduleData;

  insertSunRows: (sunrise: string, sunset: string) => void;
  clearSunRows: () => void;
  setWx: (wx: WeatherData | null) => void;

  setSyncStatus: (s: SyncStatus) => void;
  setRemoteBaseline: (savedAt: number, hash: string) => void;
  setConflictData: (d: ConflictState | null) => void;
}

function makeDefaultRows(): ScheduleRow[] {
  return Array.from({ length: DEFAULT_ROW_COUNT }, () => makeRow({ action: '' }));
}
function makeDefaultKeys(count: number): string[] {
  return Array.from({ length: count }, newKey);
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  rows: makeDefaultRows(),
  rowKeys: makeDefaultKeys(DEFAULT_ROW_COUNT),
  meta: makeMeta(),
  scheduleName: null,
  dirty: false,
  undoStack: [],
  redoStack: [],

  syncStatus: 'synced',
  remoteBaseline: null,
  conflictData: null,

  pushUndo() {
    const { rows, meta, undoStack } = get();
    const snap: Snapshot = { rows: cloneRows(rows), meta: { ...meta } };
    set({ undoStack: [...undoStack, snap].slice(-UNDO_LIMIT), redoStack: [] });
  },

  undo() {
    const { rows, meta, undoStack, redoStack } = get();
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    const cur: Snapshot = { rows: cloneRows(rows), meta: { ...meta } };
    set({
      rows: recalcRows(prev.rows),
      meta: prev.meta,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, cur],
      dirty: true,
    });
  },

  redo() {
    const { rows, meta, undoStack, redoStack } = get();
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const cur: Snapshot = { rows: cloneRows(rows), meta: { ...meta } };
    set({
      rows: recalcRows(next.rows),
      meta: next.meta,
      undoStack: [...undoStack, cur],
      redoStack: redoStack.slice(0, -1),
      dirty: true,
    });
  },

  updateRow(index, patch) {
    const { rows, rowKeys } = get();
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    const result = repositionSunRows(updated, rowKeys);
    set({ rows: result.rows, rowKeys: result.rowKeys, dirty: true });
  },

  addRowAfter(afterIndex) {
    const { rows, rowKeys } = get();
    const newRow = makeRow({ action: '' });
    const updated = [...rows.slice(0, afterIndex + 1), newRow, ...rows.slice(afterIndex + 1)];
    const updatedKeys = [...rowKeys.slice(0, afterIndex + 1), newKey(), ...rowKeys.slice(afterIndex + 1)];
    const result = repositionSunRows(updated, updatedKeys);
    set({ rows: result.rows, rowKeys: result.rowKeys, dirty: true });
  },

  deleteRow(index) {
    const { rows, rowKeys } = get();
    if (rows.length <= 1) return;
    const updated = rows.filter((_, i) => i !== index);
    const updatedKeys = rowKeys.filter((_, i) => i !== index);
    const result = repositionSunRows(updated, updatedKeys);
    set({ rows: result.rows, rowKeys: result.rowKeys, dirty: true });
  },

  reorderRows(from, to) {
    const { rows, rowKeys } = get();
    const updatedRows = [...rows];
    const updatedKeys = [...rowKeys];
    const [movedRow] = updatedRows.splice(from, 1);
    const [movedKey] = updatedKeys.splice(from, 1);
    updatedRows.splice(to, 0, movedRow);
    updatedKeys.splice(to, 0, movedKey);
    const result = repositionSunRows(updatedRows, updatedKeys);
    set({ rows: result.rows, rowKeys: result.rowKeys, dirty: true });
  },

  updateMeta(patch) {
    const { meta } = get();
    set({ meta: { ...meta, ...patch }, dirty: true });
  },

  loadSchedule(name, data) {
    const normalized = normalizeRows(data.rows);
    set({
      rows: recalcRows(normalized),
      rowKeys: makeDefaultKeys(normalized.length),
      meta: data.meta,
      scheduleName: name,
      dirty: false,
      undoStack: [],
      redoStack: [],
      syncStatus: 'synced',
      conflictData: null,
    });
  },

  newSchedule(name = 'Untitled') {
    const rows = makeDefaultRows();
    set({
      rows,
      rowKeys: makeDefaultKeys(rows.length),
      meta: makeMeta(),
      scheduleName: name,
      dirty: false,
      undoStack: [],
      redoStack: [],
      syncStatus: 'synced',
      remoteBaseline: null,
      conflictData: null,
    });
  },

  markClean() {
    set({ dirty: false });
  },

  getScheduleData(): ScheduleData {
    const { rows, meta } = get();
    return { rows, meta, savedAt: Date.now() };
  },

  insertSunRows(sunrise, sunset) {
    const { rows, rowKeys } = get();
    const clean = rows.filter(r => !r.sunLocked);
    const cleanKeys = rowKeys.filter((_, i) => !rows[i].sunLocked);
    const recalced = recalcRows(clean);

    const srMin = t12m(sunrise);
    const ssMin = t12m(sunset);
    const times = recalced.map(r => ({ in: t12m(r.timeIn), out: t12m(computeTimeOut(r)) }));
    const hasT = times.some(t => t.in >= 0);

    function findPt(timeMin: number, isRise: boolean): { idx: number; note: string } {
      if (!hasT) return { idx: isRise ? 0 : 1, note: '' };
      const evtName = isRise ? 'Sunrise' : 'Sunset';
      for (let i = 0; i < times.length; i++) {
        const { in: inM, out: outM } = times[i];
        if (inM >= 0 && timeMin <= inM) return { idx: i, note: '' };
        if (inM >= 0 && outM >= 0 && timeMin > inM && timeMin < outM && recalced[i].action) {
          return { idx: i + 1, note: `${evtName} during: ${recalced[i].action}` };
        }
      }
      return { idx: recalced.length, note: '' };
    }

    const inserts: Array<{ pt: { idx: number; note: string }; label: string; time: string }> = [];
    if (srMin >= 0) inserts.push({ pt: findPt(srMin, true), label: '🌅 Sunrise', time: sunrise });
    if (ssMin >= 0) inserts.push({ pt: findPt(ssMin, false), label: '🌇 Sunset', time: sunset });
    inserts.sort((a, b) => b.pt.idx - a.pt.idx);

    const newRows = [...clean];
    const newKeys = [...cleanKeys];
    inserts.forEach(({ pt, label, time }) => {
      newRows.splice(pt.idx, 0, makeRow({ action: label, sunLocked: true, timeIn: time, desc: pt.note }));
      newKeys.splice(pt.idx, 0, newKey());
    });

    set({ rows: recalcRows(newRows), rowKeys: newKeys, dirty: true });
  },

  clearSunRows() {
    const { rows, rowKeys } = get();
    const newRows = rows.filter(r => !r.sunLocked);
    const newKeys = rowKeys.filter((_, i) => !rows[i].sunLocked);
    set({ rows: recalcRows(newRows), rowKeys: newKeys, dirty: true });
  },

  setWx(wx) {
    const { meta } = get();
    set({ meta: { ...meta, wx }, dirty: true });
  },

  setSyncStatus(s) { set({ syncStatus: s }); },
  setRemoteBaseline(savedAt, hash) { set({ remoteBaseline: { savedAt, hash } }); },
  setConflictData(d) { set({ conflictData: d }); },
}));
