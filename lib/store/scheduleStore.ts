import { create } from 'zustand';
import type {TemplateUse} from '../platform/schedule-templates';
import { makeRow, makeMeta, normalizeRows } from '../rowNormalizer';
import { recalcRows, t12m, computeTimeOut } from '../time';
import { startMinutes, finishMinutes, hasPlannedWork } from '../flexible-time';
import { UNDO_LIMIT, DEFAULT_ROW_COUNT } from '../constants';
import type { ScheduleRow, ScheduleMeta, ScheduleData, WeatherData, SyncStatus, ConflictState } from '../types';

const planStart=(rows:ScheduleRow[])=>{const first=rows.find(hasPlannedWork);return first?startMinutes(first):null;};
const flexibleDefault={mode:'flexible',between:'backward'} as const;
const timingFor=(s:{meta:ScheduleMeta;timingEditor:boolean})=>s.meta.timing??(s.timingEditor?flexibleDefault:undefined);

// After any row mutation, re-position sun-locked rows to their correct chronological slot.
function repositionSunRows(rows: ScheduleRow[], rowKeys: string[], timing?: ScheduleMeta['timing'], calculate=true, fallbackStart?:number|null): { rows: ScheduleRow[]; rowKeys: string[] } {
  const sunRows: ScheduleRow[] = [];
  const sunKeys: string[] = [];
  const cleanRows: ScheduleRow[] = [];
  const cleanKeys: string[] = [];

  rows.forEach((r, i) => {
    if (r.sunLocked) { sunRows.push(r); sunKeys.push(rowKeys[i]); }
    else             { cleanRows.push(r); cleanKeys.push(rowKeys[i]); }
  });

  if (sunRows.length === 0) return { rows: (calculate?recalcRows(rows,timing,fallbackStart):rows), rowKeys };

  const recalced = calculate?recalcRows(cleanRows,timing,fallbackStart):cleanRows;
  const times = recalced.map(r => ({ in: timing?startMinutes(r):(t12m(r.timeIn)<0?null:t12m(r.timeIn)), out: timing?finishMinutes(r):(t12m(computeTimeOut(r))<0?null:t12m(computeTimeOut(r))) }));
  const hasT = times.some(t => t.in !== null);

  function findPt(timeMin: number, isRise: boolean): { idx: number; note: string } {
    if (!hasT) return { idx: isRise ? 0 : 1, note: '' };
    const evtName = isRise ? 'Sunrise' : 'Sunset';
    for (let i = 0; i < times.length; i++) {
      const { in: inM, out: outM } = times[i];
      if (inM !== null && timeMin <= inM) return { idx: i, note: '' };
      if (inM !== null && outM !== null && timeMin > inM && timeMin < outM && recalced[i].action) {
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

  return { rows: calculate?recalcRows(newRows,timing,fallbackStart):newRows, rowKeys: newKeys };
}

type Snapshot = { rows: ScheduleRow[]; meta: ScheduleMeta; templateUses?: TemplateUse[] };
const snapshotKey = (s: Snapshot) => JSON.stringify({ rows:s.rows, meta:s.meta, templateUses:s.templateUses ?? [] });
export function hasUndoChanges(state: Snapshot & { undoStack: Snapshot[] }): boolean {
  const current = snapshotKey(state);
  return state.undoStack.some(snapshot => snapshotKey(snapshot) !== current);
}

let keySeq = 0;
function newKey(): string { return `rk_${++keySeq}`; }

export interface ScheduleStore {
  rows: ScheduleRow[];
  rowKeys: string[];
  meta: ScheduleMeta;
  timingEditor: boolean; // New editor capability; never stored in the document.
  // Retain fields introduced by the other app across a legacy editor round trip.
  documentExtras: Record<string, unknown>;
  scheduleName: string | null;
  dirty: boolean;
  // In-memory request guards; never serialized into ScheduleData.
  editRevision: number;
  documentSession: number;
  templateUses: TemplateUse[];
  applyTemplateRows: (rows: ScheduleRow[], use: TemplateUse) => void;
  acknowledgeTemplateUses: (uses: readonly TemplateUse[]) => void;
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  syncStatus: SyncStatus;
  remoteBaseline: { savedAt: number; hash: string } | null;
  conflictData: ConflictState | null;

  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  updateRow: (index: number, patch: Partial<ScheduleRow>) => void;
  addRowAfter: (afterIndex: number, row?: Partial<ScheduleRow>) => void;
  deleteRow: (index: number) => void;
  reorderRows: (from: number, to: number) => void;
  updateMeta: (patch: Partial<ScheduleMeta>) => void;

  loadSchedule: (name: string, data: ScheduleData, timingEditor?: boolean) => void;
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
  timingEditor: false,
  documentExtras: {},
  scheduleName: null,
  dirty: false,
  editRevision: 0,
  documentSession: 0,
  templateUses: [],
  undoStack: [],
  redoStack: [],

  syncStatus: 'synced',
  remoteBaseline: null,
  conflictData: null,

  pushUndo() {
    const { rows, meta, undoStack, templateUses } = get();
    const snap: Snapshot = { rows: structuredClone(rows), meta: structuredClone(meta), templateUses: structuredClone(templateUses) };
    if (undoStack.length && snapshotKey(undoStack[undoStack.length - 1]) === snapshotKey(snap)) return;
    set({ undoStack: [...undoStack, snap].slice(-UNDO_LIMIT) });
  },

  undo() {
    const { rows, meta, undoStack, redoStack, templateUses } = get();
    if (!undoStack.length) return;
    const cur: Snapshot = { rows: structuredClone(rows), meta: structuredClone(meta), templateUses: structuredClone(templateUses) };
    const current = snapshotKey(cur);
    let position = undoStack.length - 1;
    while (position >= 0 && snapshotKey(undoStack[position]) === current) position--;
    if (position < 0) { set({ undoStack: [] }); return; }
    const prev = undoStack[position];
    set({
      rows: get().timingEditor?prev.rows:recalcRows(prev.rows,prev.meta.timing),
      rowKeys: makeDefaultKeys(prev.rows.length),
      meta: prev.meta,
      templateUses: prev.templateUses ?? [],
      undoStack: undoStack.slice(0, position),
      redoStack: [...redoStack, cur],
      dirty: true,
      editRevision: get().editRevision + 1,
    });
  },

  redo() {
    const { rows, meta, undoStack, redoStack, templateUses } = get();
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const cur: Snapshot = { rows: structuredClone(rows), meta: structuredClone(meta), templateUses: structuredClone(templateUses) };
    set({
      rows: get().timingEditor?next.rows:recalcRows(next.rows,next.meta.timing),
      rowKeys: makeDefaultKeys(next.rows.length),
      meta: next.meta,
      templateUses: next.templateUses ?? [],
      undoStack: [...undoStack, cur],
      redoStack: redoStack.slice(0, -1),
      dirty: true,
      editRevision: get().editRevision + 1,
    });
  },

  updateRow(index, patch) {
    const { rows, rowKeys } = get();
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    const timingEdit=['dur','timeIn','timeInDay','fixedIn','fixedOut','fixedOutTime','fixedOutDay'].some(k=>k in patch);
    const calculate=!get().timingEditor||timingEdit;
    const timing=timingFor(get());
    const result=calculate?repositionSunRows(updated,rowKeys,timing,true,planStart(rows)):{rows:updated,rowKeys};
    set({...result,...(get().timingEditor&&timingEdit?{meta:{...get().meta,timing}}:{}),dirty:true,redoStack:[],editRevision:get().editRevision+1});
  },

  addRowAfter(afterIndex, row = {}) {
    const { rows, rowKeys } = get();
    const newRow = makeRow({ action: '',...row });
    const updated = [...rows.slice(0, afterIndex + 1), newRow, ...rows.slice(afterIndex + 1)];
    const updatedKeys = [...rowKeys.slice(0, afterIndex + 1), newKey(), ...rowKeys.slice(afterIndex + 1)];
    const result = repositionSunRows(updated, updatedKeys,timingFor(get()),!get().timingEditor||!!row.dur||!!row.fixedIn||!!row.fixedOut,planStart(rows));
    set({ rows: result.rows, rowKeys: result.rowKeys,...(get().timingEditor?{meta:{...get().meta,timing:timingFor(get())}}:{}), dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  deleteRow(index) {
    const { rows, rowKeys } = get();
    if (rows.length <= 1) return;
    const updated = rows.filter((_, i) => i !== index);
    const updatedKeys = rowKeys.filter((_, i) => i !== index);
    const result = repositionSunRows(updated, updatedKeys,timingFor(get()),true,planStart(rows));
    set({ rows: result.rows, rowKeys: result.rowKeys,...(get().timingEditor?{meta:{...get().meta,timing:timingFor(get())}}:{}), dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  reorderRows(from, to) {
    const { rows, rowKeys } = get();
    const updatedRows = [...rows];
    const updatedKeys = [...rowKeys];
    const [movedRow] = updatedRows.splice(from, 1);
    const [movedKey] = updatedKeys.splice(from, 1);
    updatedRows.splice(to, 0, movedRow);
    updatedKeys.splice(to, 0, movedKey);
    const result = repositionSunRows(updatedRows, updatedKeys,timingFor(get()),true,planStart(rows));
    set({ rows: result.rows, rowKeys: result.rowKeys,...(get().timingEditor?{meta:{...get().meta,timing:timingFor(get())}}:{}), dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  updateMeta(patch) {
    const { meta, rows, rowKeys } = get();
    const locationChanged = (['date', 'lat', 'lng'] as const).some(key => key in patch && patch[key] !== meta[key]);
    const next = { ...meta, ...patch };
    if (locationChanged) next.wx = null;
    set({ meta: next,
      ...((locationChanged||'timing' in patch) ? repositionSunRows(locationChanged?rows.filter(row=>!row.sunLocked):rows,locationChanged?rowKeys.filter((_,i)=>!rows[i].sunLocked):rowKeys,next.timing, !get().timingEditor||'timing' in patch) : {}),
      dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  loadSchedule(name, data, timingEditor=false) {
    const normalized = normalizeRows(data.rows);
    const { rows: _rows, meta: _meta, savedAt: _savedAt, ...extras } = data;
    set({
      documentExtras: structuredClone(extras),
      rows: timingEditor?normalized:recalcRows(normalized,data.meta.timing),
      timingEditor,
      rowKeys: makeDefaultKeys(normalized.length),
      meta: data.meta,
      scheduleName: name,
      documentSession: get().documentSession + 1,
      editRevision: get().editRevision + 1,
      dirty: false,
      templateUses: [],
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
      timingEditor:false,
      documentExtras: {},
      scheduleName: name,
      documentSession: get().documentSession + 1,
      editRevision: get().editRevision + 1,
      dirty: false,
      templateUses: [],
  undoStack: [],
      redoStack: [],
      syncStatus: 'synced',
      remoteBaseline: null,
      conflictData: null,
    });
  },

  applyTemplateRows(rows, use) {
    get().pushUndo();
    const normalized = recalcRows(normalizeRows(structuredClone(rows).map(row => ({...row,sunLocked:false}))),timingFor(get()));
    // Every row is replaced; Undo retains the previous rows and their provenance.
    const templateUses = [structuredClone(use)];
    set({meta:{...get().meta,...(get().timingEditor?{timing:timingFor(get())}:{})},rows:normalized,rowKeys:makeDefaultKeys(normalized.length),templateUses,dirty:true,redoStack:[],editRevision:get().editRevision+1});
  },
  acknowledgeTemplateUses(uses) {
    const remove=(values:TemplateUse[]=[])=>values.filter(v=>!uses.some(u=>u.id===v.id&&u.version===v.version&&u.policy===v.policy));
    set({templateUses:remove(get().templateUses),undoStack:get().undoStack.map(v=>({...v,templateUses:remove(v.templateUses)})),redoStack:get().redoStack.map(v=>({...v,templateUses:remove(v.templateUses)}))});
  },
  markClean() {
    set({ dirty: false });
  },

  getScheduleData(): ScheduleData {
    const { rows, meta, documentExtras } = get();
    return { ...structuredClone(documentExtras), rows, meta, savedAt: Date.now() };
  },

  insertSunRows(sunrise, sunset) {
    const { rows, rowKeys } = get();
    const clean = rows.filter(r => !r.sunLocked);
    const cleanKeys = rowKeys.filter((_, i) => !rows[i].sunLocked);
    const recalced = get().timingEditor?clean:recalcRows(clean,get().meta.timing);

    const srMin = t12m(sunrise);
    const ssMin = t12m(sunset);
    const times = recalced.map(r => ({ in: timingFor(get())?startMinutes(r):(t12m(r.timeIn)<0?null:t12m(r.timeIn)), out: timingFor(get())?finishMinutes(r):(t12m(computeTimeOut(r))<0?null:t12m(computeTimeOut(r))) }));
    const hasT = times.some(t => t.in !== null);

    function findPt(timeMin: number, isRise: boolean): { idx: number; note: string } {
      if (!hasT) return { idx: isRise ? 0 : 1, note: '' };
      const evtName = isRise ? 'Sunrise' : 'Sunset';
      for (let i = 0; i < times.length; i++) {
        const { in: inM, out: outM } = times[i];
        if (inM !== null && timeMin <= inM) return { idx: i, note: '' };
        if (inM !== null && outM !== null && timeMin > inM && timeMin < outM && recalced[i].action) {
          return { idx: i + 1, note: `${evtName} during: ${recalced[i].action}` };
        }
      }
      return { idx: recalced.length, note: '' };
    }

    const inserts: Array<{ pt: { idx: number; note: string }; label: string; time: string }> = [];
    if (srMin >= 0) inserts.push({ pt: findPt(srMin, true), label: '🌅 Sunrise', time: sunrise });
    if (ssMin >= 0) inserts.push({ pt: findPt(ssMin, false), label: '🌇 Sunset', time: sunset });
    // Insert in reverse chronological order at a shared index so the final rows read forward.
    inserts.sort((a, b) => b.pt.idx - a.pt.idx || t12m(b.time) - t12m(a.time));

    const newRows = [...clean];
    const newKeys = [...cleanKeys];
    inserts.forEach(({ pt, label, time }) => {
      newRows.splice(pt.idx, 0, makeRow({ action: label, sunLocked: true, timeIn: time, desc: pt.note }));
      newKeys.splice(pt.idx, 0, newKey());
    });

    set({ rows: get().timingEditor?newRows:recalcRows(newRows,get().meta.timing), rowKeys: newKeys, dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  clearSunRows() {
    const { rows, rowKeys } = get();
    const newRows = rows.filter(r => !r.sunLocked);
    const newKeys = rowKeys.filter((_, i) => !rows[i].sunLocked);
    set({ rows: get().timingEditor?newRows:recalcRows(newRows,get().meta.timing), rowKeys: newKeys, dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  setWx(wx) {
    const { meta } = get();
    set({ meta: { ...meta, wx }, dirty: true, redoStack: [], editRevision: get().editRevision + 1 });
  },

  setSyncStatus(s) { set({ syncStatus: s }); },
  setRemoteBaseline(savedAt, hash) { set({ remoteBaseline: { savedAt, hash } }); },
  setConflictData(d) { set({ conflictData: d }); },
}));
