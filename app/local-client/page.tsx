import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import LocalClientViewer from '@/components/view/LocalClientViewer';
export const dynamic='force-dynamic';
export const metadata={title:'Shared schedule',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){if(!readLocalWorkspaceConfig(process.env,(await headers()).get('host')))notFound();return <LocalClientViewer/>;}
