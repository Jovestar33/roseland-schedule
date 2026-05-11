import type { ScheduleData } from '../types';

export async function postLoad(
  name: string,
  editorToken: string
): Promise<ScheduleData | null> {
  const params = new URLSearchParams({ name, editorToken, _: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/load?${params}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);
  return res.json() as Promise<ScheduleData>;
}
