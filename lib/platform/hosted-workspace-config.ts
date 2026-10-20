import type { LocalEditorConfig } from './local-editor-config.ts';

export type HostedWorkspaceConfig = LocalEditorConfig & { appOrigin: string; projectRef: string };
type Environment = Record<string, string | undefined>;

function httpsOrigin(value: string | undefined): URL | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.')
      || /^(localhost|127\.|0\.|\[)/.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

/** Separate from the loopback rehearsal gate. Returns public configuration only.
 * This validates deployment configuration, not user authentication or database readiness.
 * Preview builds must never inherit access to the live trial database.
 */
export function readHostedWorkspaceConfig(env: Environment, host: string | null, onRejected?: (reason: string) => void): HostedWorkspaceConfig | null {
  const reject = (reason: string): null => { onRejected?.(reason); return null; };
  if (env.ROSELAND_HOSTED_APP !== 'supabase' || env.VERCEL !== '1'
    || env.VERCEL_ENV !== 'production' || env.NETLIFY
    || env.SUPABASE_PLATFORM_WORKFLOWS_ENABLED !== 'true') return reject('runtime-flags');
  if (Object.entries(env).some(([name, value]) => name.startsWith('ROSELAND_LOCAL_') && value)) return reject('local-only-setting');
  const origin = httpsOrigin(env.ROSELAND_APP_ORIGIN);
  const backend = httpsOrigin(env.SUPABASE_URL);
  const projectRef = env.ROSELAND_SUPABASE_PROJECT_REF;
  if (!origin) return reject('app-origin');
  if (host !== origin.host) return reject('request-host');
  if (!backend || !projectRef || !/^[a-z]{20}$/.test(projectRef)
    || backend.origin !== `https://${projectRef}.supabase.co`) return reject('database-binding');
  // Modern publishable keys only. Never serialize a secret or service-role JWT.
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return reject('publishable-key-format');
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret === key) return reject('server-key-missing-or-public');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) {
    try {
      const parts = secret.split('.');
      if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return reject('server-key-format');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (claims.role !== 'service_role' || claims.iss !== 'supabase' || claims.ref !== projectRef) return reject('server-key-binding');
    } catch { return reject('server-key-format'); }
  }
  return { appOrigin: origin.origin, projectRef, supabaseUrl: backend.origin, anonymousKey: key,
    hosted: true, accountOnboarding: true, liveDocumentProviders: true };
}
