import type { SheetMeta, CallSheetData } from '../types';

const T = () => String(Date.now());

// ── Sheet meta ─────────────────────────────────────────────────────────────────

export async function loadSheetMeta(name: string, editorToken: string): Promise<SheetMeta> {
  const params = new URLSearchParams({ name, editorToken, _: T() });
  const res = await fetch(`/.netlify/functions/sheet-meta-load?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);
  const body = await res.json() as { data?: SheetMeta };
  return body.data ?? defaultSheetMeta();
}

export async function loadSheetMetaPublic(name: string): Promise<SheetMeta> {
  const params = new URLSearchParams({ name, public: '1', _: T() });
  const res = await fetch(`/.netlify/functions/sheet-meta-load?${params}`, { cache: 'no-store' });
  if (!res.ok) return defaultSheetMeta();
  const body = await res.json() as { data?: SheetMeta };
  return body.data ?? defaultSheetMeta();
}

export async function saveSheetMeta(name: string, data: SheetMeta, editorToken: string): Promise<void> {
  const res = await fetch('/.netlify/functions/sheet-meta-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data, editorToken }),
  });
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
}

// ── Call sheet data ────────────────────────────────────────────────────────────

export async function loadCallSheetData(name: string, editorToken: string): Promise<CallSheetData> {
  const params = new URLSearchParams({ name, editorToken, _: T() });
  const res = await fetch(`/.netlify/functions/callsheet-load?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);
  const body = await res.json() as { data?: CallSheetData };
  return body.data ?? defaultCallSheetData();
}

export async function loadCallSheetDataPublic(name: string): Promise<CallSheetData> {
  const params = new URLSearchParams({ name, public: '1', _: T() });
  const res = await fetch(`/.netlify/functions/callsheet-load?${params}`, { cache: 'no-store' });
  if (!res.ok) return defaultCallSheetData();
  const body = await res.json() as { data?: CallSheetData };
  return body.data ?? defaultCallSheetData();
}

export async function saveCallSheetData(name: string, data: CallSheetData, editorToken: string): Promise<void> {
  const res = await fetch('/.netlify/functions/callsheet-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data, editorToken }),
  });
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
}

// ── Hospital lookup ────────────────────────────────────────────────────────────

export async function lookupHospital(
  town: string,
  state: string,
  editorToken: string
): Promise<{ name: string; address: string; phone: string } | null> {
  const params = new URLSearchParams({ town, state, editorToken, _: T() });
  const res = await fetch(`/.netlify/functions/hospital-lookup?${params}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = await res.json() as { result?: { name: string; address: string; phone: string } };
  return body.result ?? null;
}

// ── Send sheet ─────────────────────────────────────────────────────────────────

export interface SendSheetParams {
  to: string[];
  subject?: string;
  callSheetUrl?: string;
  contactSheetUrl?: string;
  scheduleName: string;
  scheduleDate: string;
}

export async function sendSheet(params: SendSheetParams, editorToken: string): Promise<void> {
  const res = await fetch('/.netlify/functions/send-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, editorToken }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Send failed: HTTP ${res.status}`);
  }
}

// ── Defaults ───────────────────────────────────────────────────────────────────

export function defaultSheetMeta(): SheetMeta {
  return {
    distributionList: [],
    clientReps: [],
    emergencyContact: { name: '', phone: '', backupPhone: '' },
    additionalCrew: [],
    dietaryRestrictions: [],
  };
}

export function defaultCallSheetData(): CallSheetData {
  return {
    hospital: { name: '', address: '', phone: '' },
    parking: '',
    staggeredCalls: [],
    castBlock: [],
    crewBlock: [],
    condensedDayOverride: null,
    advancedSchedule: '',
    departmentNotes: [],
    generalNotes: '',
  };
}
