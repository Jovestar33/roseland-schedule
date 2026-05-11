import type { ScheduleData } from '../types';

interface SaveOpts {
  force?: boolean;
  expectedSavedAt?: number;
  expectedHash?: string;
}

export interface SaveResult {
  ok: boolean;
  savedAt: number;
  hash?: string;
}

export interface SaveError extends Error {
  conflict?: boolean;
  remoteSavedAt?: number;
  remoteHash?: string;
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
      expectedHash: opts.expectedHash ?? '',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as {
      error?: string;
      remoteSavedAt?: number;
      remoteHash?: string;
      remoteData?: ScheduleData | null;
    };
    const err = new Error(body.error ?? `Save failed: HTTP ${res.status}`) as SaveError;
    if (res.status === 409) {
      err.conflict = true;
      err.remoteSavedAt = body.remoteSavedAt ?? 0;
      err.remoteHash = body.remoteHash ?? '';
      err.remoteData = body.remoteData ?? null;
    }
    throw err;
  }

  return res.json() as Promise<SaveResult>;
}
