import { LS_TEMPLATES_KEY } from './constants';
import type { ScheduleRow } from './types';

export interface Template {
  rows: ScheduleRow[];
  savedAt: number;
}

export type TemplateMap = Record<string, Template>;

export function getTemplates(): TemplateMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_TEMPLATES_KEY) ?? '{}') as TemplateMap;
  } catch {
    return {};
  }
}

export function saveTemplate(name: string, rows: ScheduleRow[]): void {
  const all = getTemplates();
  all[name] = { rows: rows.filter((r) => !r.sunLocked), savedAt: Date.now() };
  localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(all));
}

export function deleteTemplate(name: string): void {
  const all = getTemplates();
  delete all[name];
  localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(all));
}
