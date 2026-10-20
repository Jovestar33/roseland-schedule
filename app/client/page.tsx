import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import LocalClientViewer from '@/components/view/LocalClientViewer';
export const dynamic='force-dynamic';
export const metadata={title:'Shared schedule',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){if(!readHostedWorkspaceConfig(process.env,(await headers()).get('host')))notFound();return <LocalClientViewer endpoint="/api/platform/client-view"/>;}
