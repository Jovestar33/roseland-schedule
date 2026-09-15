import { readLocalEditorConfig, type LocalEditorConfig } from './local-editor-config.ts';

export function readLocalAdminConfig(env: Record<string, string | undefined>, host: string | null): LocalEditorConfig | null {
  if (env.ROSELAND_LOCAL_ADMIN !== 'supabase' || env.SUPABASE_PLATFORM_WORKFLOWS_ENABLED !== 'true') return null;
  const config = readLocalEditorConfig({ ...env, ROSELAND_LOCAL_EDITOR: 'supabase' }, host);
  if (!config || env.SUPABASE_URL !== config.supabaseUrl || env.SUPABASE_PUBLISHABLE_KEY !== config.anonymousKey) return null;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret === config.anonymousKey || secret.startsWith('sb_publishable_')) return null;
  return config;
}
