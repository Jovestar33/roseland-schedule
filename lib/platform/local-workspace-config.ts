import { readLocalAdminConfig } from './local-admin-config.ts';
import type { LocalEditorConfig } from './local-editor-config.ts';
export function readLocalWorkspaceConfig(env: Record<string,string|undefined>, host: string|null): LocalEditorConfig|null {
  if (env.ROSELAND_LOCAL_WORKSPACE !== 'supabase') return null;
  const config=readLocalAdminConfig({...env,ROSELAND_LOCAL_ADMIN:'supabase'},host);
  return config&&env.ROSELAND_LOCAL_DOCUMENT_PROVIDERS==='live'?{...config,liveDocumentProviders:true}:config;
}
