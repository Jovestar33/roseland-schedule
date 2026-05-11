import { create } from 'zustand';
import { makeRow, makeMeta, normalizeRows } from '../rowNormalizer';
import { recalcRows } from '../time';
import { UNDO_LIMIT, DEFAULT_ROW_COUNT } from '../constants';
import type { ScheduleRow, ScheduleMeta, ScheduleData, SyncStatus, ConflictState } from '../types';

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
    const { rows } = get();
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    set({ rows: recalcRows(updated), dirty: true });
  },

  addRowAfter(afterIndex) {
    const { rows, rowKeys } = get();
    const newRow = makeRow({ action: '' });
    const updated = [...rows.slice(0, afterIndex + 1), newRow, ...rows.slice(afterIndex + 1)];
    const updatedKeys = [...rowKeys.slice(0, afterIndex + 1), newKey(), ...rowKeys.slice(afterIndex + 1)];
    set({ rows: recalcRows(updated), rowKeys: updatedKeys, dirty: true });
  },

  deleteRow(index) {
    const { rows, rowKeys } = get();
    if (rows.length <= 1) return;
    const updated = rows.filter((_, i) => i !== index);
    const updatedKeys = rowKeys.filter((_, i) => i !== index);
    set({ rows: recalcRows(updated), rowKeys: updatedKeys, dirty: true });
  },

  reorderRows(from, to) {
    const { rows, rowKeys } = get();
    const updatedRows = [...rows];
    const updatedKeys = [...rowKeys];
    const [movedRow] = updatedRows.splice(from, 1);
    const [movedKey] = updatedKeys.splice(from, 1);
    updatedRows.splice(to, 0, movedRow);
    updatedKeys.splice(to, 0, movedKey);
    set({ rows: recalcRows(updatedRows), rowKeys: updatedKeys, dirty: true });
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

  setSyncStatus(s) { set({ syncStatus: s }); },
  setRemoteBaseline(savedAt, hash) { set({ remoteBaseline: { savedAt, hash } }); },
  setConflictData(d) { set({ conflictData: d }); },
}));
