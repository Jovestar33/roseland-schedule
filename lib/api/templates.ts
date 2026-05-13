import type { TemplateMap } from '../templates';
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
