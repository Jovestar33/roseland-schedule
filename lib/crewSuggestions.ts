const CREW_KEY = 'rp_crew_names';

type CrewField = 'prod' | 'dir' | 'dp';

function load(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(CREW_KEY) || '{}') as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function getCrewSuggestions(field: CrewField): string[] {
  return load()[field] ?? [];
}

export function saveCrewSuggestion(field: CrewField, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const all = load();
  const list = all[field] ?? [];
  const updated = [trimmed, ...list.filter(v => v.toLowerCase() !== trimmed.toLowerCase())].slice(0, 20);
  try {
    localStorage.setItem(CREW_KEY, JSON.stringify({ ...all, [field]: updated }));
  } catch { /* ignore */ }
}
