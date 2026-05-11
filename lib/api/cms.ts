export interface CmsAction {
  name: string;
  color: string; // CSS class like 'aShoot', or ''
}

export interface CmsConfig {
  actions?: CmsAction[];
  actionStyles?: Record<string, { bg: string; text: string }>;
  colors?: Record<string, string>;
  labels?: Record<string, string>;
  logo?: string | null;
}

export async function loadCmsConfig(): Promise<CmsConfig> {
  const res = await fetch('/.netlify/functions/cms-load');
  if (!res.ok) return {};
  return res.json() as Promise<CmsConfig>;
}

export async function verifyCmsPin(pin: string): Promise<boolean> {
  const res = await fetch('/.netlify/functions/cms-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, verify: true }),
  });
  if (!res.ok) return false;
  const body = await res.json() as { ok?: boolean };
  return body.ok === true;
}

export async function saveCmsConfig(config: CmsConfig, pin: string): Promise<void> {
  const res = await fetch('/.netlify/functions/cms-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, pin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'CMS save failed');
  }
}
