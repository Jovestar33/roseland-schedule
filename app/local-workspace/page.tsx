import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readLocalWorkspaceConfig } from '@/lib/platform/local-workspace-config';
import LocalWorkspaceClient from './LocalWorkspaceClient';
export const dynamic='force-dynamic';
export const metadata={title:'Local Roseland workspace',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function LocalWorkspacePage(){const config=readLocalWorkspaceConfig(process.env,(await headers()).get('host'));if(!config)notFound();return <LocalWorkspaceClient config={{...config,accountOnboarding:process.env.ROSELAND_LOCAL_ACCOUNTS==='supabase'}}/>;}
