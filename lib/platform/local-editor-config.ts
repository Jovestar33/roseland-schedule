export interface LocalEditorConfig { supabaseUrl: string; anonymousKey: string; accountOnboarding?: boolean; liveDocumentProviders?: boolean }

/** Disabled by default; even an accidental hosted flag cannot expose this route. */
export function readLocalEditorConfig(env: Record<string, string | undefined>, host: string | null): LocalEditorConfig | null {
  if (env.ROSELAND_LOCAL_EDITOR !== 'supabase' || env.NETLIFY || env.VERCEL) return null;
  if (!host || !/^(127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/.test(host)) return null;
  try {
    const url = new URL(env.ROSELAND_LOCAL_SUPABASE_URL ?? '');
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const key = env.ROSELAND_LOCAL_SUPABASE_ANON_KEY ?? '';
    // CLI local anon JWT only, never a service-role or hosted secret key.
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (claims.role !== 'anon' || !['supabase', 'supabase-demo'].includes(claims.iss)) return null;
    return { supabaseUrl: url.origin, anonymousKey: key };
  } catch { return null; }
}
