import type { ScheduleData, Snapshot } from '../types';

export async function postAddSnapshot(
  name: string,
  data: ScheduleData,
  label: string,
  editorToken: string
): Promise<void> {
  const res = await fetch('/.netlify/functions/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      snapshot: {
        id: crypto.randomUUID(),
        savedAt: Date.now(),
        label,
        data,
      },
      editorToken,
      action: 'add',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Snapshot] Save failed — HTTP', res.status, text);
  } else {
    console.log('[Snapshot] Saved OK —', label, 'for', name);
  }
}

export async function getSnapshots(
  name: string,
  editorToken: string
): Promise<Snapshot[]> {
  const params = new URLSearchParams({ editorToken, name, t: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/snapshots?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Snapshots load failed: HTTP ${res.status}`);
  const body = await res.json() as { snapshots?: Snapshot[] };
  return body.snapshots ?? [];
}

export async function deleteSnapshot(
  name: string,
  snapshotId: string,
  editorToken: string
): Promise<void> {
  await fetch('/.netlify/functions/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, snapshotId, editorToken, action: 'delete' }),
  });
}
