import type { ScheduleData } from '../types';

export async function postLoadView(
  name: string,
  viewToken: string
): Promise<ScheduleData | null> {
  const params = new URLSearchParams({ name, viewToken, _: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/load?${params}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error('Invalid or expired link');
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);
  return res.json() as Promise<ScheduleData>;
}

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

export async function postLoadPublic(name: string): Promise<ScheduleData | null> {
  const params = new URLSearchParams({ name, public: '1', _: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/load?${params}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);
  return res.json() as Promise<ScheduleData>;
}

export async function listSchedules(editorToken: string): Promise<string[]> {
  const params = new URLSearchParams({ editorToken, _: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/load?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`List failed: HTTP ${res.status}`);
  const body = await res.json() as { schedules?: string[] };
  return body.schedules ?? [];
}
