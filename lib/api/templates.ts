import type { TemplateMap } from '../templates';
import { getTemplates } from '../templates';
import { LS_TEMPLATES_KEY } from '../constants';
import type { ScheduleRow } from '../types';

const FN = '/.netlify/functions/templates';

async function post(body: object): Promise<TemplateMap> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Templates request failed: HTTP ${res.status}`);
  return ((await res.json()) as { templates: TemplateMap }).templates ?? {};
}

export async function loadTemplates(token: string): Promise<TemplateMap> {
  const params = new URLSearchParams({ editorToken: token, _: String(Date.now()) });
  const res = await fetch(`${FN}?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load templates failed: HTTP ${res.status}`);
  return ((await res.json()) as { templates: TemplateMap }).templates ?? {};
}

export async function saveTemplateRemote(name: string, rows: ScheduleRow[], token: string): Promise<TemplateMap> {
  return post({ editorToken: token, action: 'save', name, rows });
}

export async function deleteTemplateRemote(name: string, token: string): Promise<TemplateMap> {
  return post({ editorToken: token, action: 'delete', name });
}

export async function migrateTemplates(templates: TemplateMap, token: string): Promise<TemplateMap> {
  return post({ editorToken: token, action: 'replace', templates });
}

export async function loadTemplatesWithRecovery(token: string): Promise<TemplateMap> {
  const remote = await loadTemplates(token);
  const local = getTemplates();
  if (!Object.keys(local).length) return remote;
  const original = JSON.stringify(local);
  const migrated = await migrateTemplates(local, token);
  // Clear only after the server acknowledges every recovered template. Keep
  // edits made in another tab while uploading, and retain copies on any failure.
  const complete = Object.values(local).every(template => Object.values(migrated)
    .some(saved => JSON.stringify(saved.rows) === JSON.stringify(template.rows)));
  if (!complete) throw new Error('Template recovery was incomplete. Local copies were retained.');
  try {
    if (JSON.stringify(getTemplates()) === original) localStorage.removeItem(LS_TEMPLATES_KEY);
  } catch { /* Keeping a redundant recovery copy is safe. */ }
  return migrated;
}
