import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import LocalWorkspaceClient from '../local-workspace/LocalWorkspaceClient';
export const dynamic='force-dynamic';
export const metadata={title:'Roseland Schedule',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function WorkspacePage(){
 const config=readHostedWorkspaceConfig(process.env,(await headers()).get('host'));
 if(!config)notFound();
 return <LocalWorkspaceClient config={config} review/>;
}
