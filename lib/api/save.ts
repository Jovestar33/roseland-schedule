import type { ScheduleData } from '../types';

interface SaveOpts {
  force?: boolean;
  expectedSavedAt?: number;
}

export interface SaveResult {
  ok: boolean;
  savedAt: number;
}

export interface SaveError extends Error {
  conflict?: boolean;
  remoteSavedAt?: number;
  remoteData?: ScheduleData | null;
}

export async function postSave(
  name: string,
  data: ScheduleData,
  editorToken: string,
  opts: SaveOpts = {}
): Promise<SaveResult> {
  const res = await fetch('/.netlify/functions/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      name,
      data,
      editorToken,
      force: opts.force ?? false,
      expectedSavedAt: opts.expectedSavedAt ?? 0,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as {
      error?: string;
      remoteSavedAt?: number;
      remoteData?: ScheduleData | null;
    };
    const err = new Error(body.error ?? `Save failed: HTTP ${res.status}`) as SaveError;
    if (res.status === 409) {
      err.conflict = true;
      err.remoteSavedAt = body.remoteSavedAt ?? 0;
      err.remoteData = body.remoteData ?? null;
    }
    throw err;
  }

  return res.json() as Promise<SaveResult>;
}

export async function postDelete(
  name: string,
  editorToken: string,
  deletePassword: string
): Promise<void> {
  const res = await fetch('/.netlify/functions/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data: null, deleted: true, editorToken, deletePassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Delete failed' })) as { error?: string };
    throw new Error(body.error ?? `Delete failed: HTTP ${res.status}`);
  }
}

export async function postDeleteSchedule(
  name: string,
  editorToken: string,
  deletePassword: string,
): Promise<{ library: import('./library').LibraryData | null }> {
  const res = await fetch('/.netlify/functions/delete-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, editorToken, deletePassword }),
  });
  const body = await res.json().catch(() => ({ error: 'Unknown error' })) as {
    error?: string;
    library?: import('./library').LibraryData | null;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `Delete failed: HTTP ${res.status}`);
  }
  return { library: body.library ?? null };
}
