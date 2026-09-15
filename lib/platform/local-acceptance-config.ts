import { readLocalEditorConfig, type LocalEditorConfig } from './local-editor-config.ts';
export function readLocalAcceptanceConfig(env: Record<string, string | undefined>, host: string | null): LocalEditorConfig | null {
  if (env.ROSELAND_LOCAL_ACCEPTANCE !== 'supabase') return null;
  return readLocalEditorConfig({ ...env, ROSELAND_LOCAL_EDITOR: 'supabase' }, host);
}
