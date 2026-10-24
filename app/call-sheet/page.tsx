import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import CallSheetRecipient from '@/components/view/CallSheetRecipient';
export const dynamic='force-dynamic';
export const metadata={title:'Call sheet',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){if(!readHostedWorkspaceConfig(process.env,(await headers()).get('host')))notFound();return <CallSheetRecipient/>;}
