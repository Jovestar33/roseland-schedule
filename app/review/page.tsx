import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import LocalWorkspaceClient from '../local-workspace/LocalWorkspaceClient';
export const dynamic='force-dynamic';
export const metadata={title:'Roseland Schedule — Fictional Review',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function ReviewPage(){
 const config=readLocalWorkspaceConfig(process.env,(await headers()).get('host'));
 if(!config)notFound();
 return <LocalWorkspaceClient config={{...config,accountOnboarding:process.env.ROSELAND_LOCAL_ACCOUNTS==='supabase'}} review/>;
}
