import {headers} from 'next/headers';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import LocalClientViewer from '@/components/view/LocalClientViewer';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer' as const};
import PublicViewer from '@/components/view/PublicViewer';

interface Props {
  searchParams: Promise<{ vt?: string }>;
  params: Promise<{ name: string }>;
}

export default async function PublicViewPage({ params, searchParams }: Props) {
  const { name } = await params;
  const { vt } = await searchParams;
  if(readLocalWorkspaceConfig(process.env,(await headers()).get('host')))return <LocalClientViewer legacyName={name} legacyToken={vt}/>;
  return <PublicViewer name={name} viewToken={vt ?? ''} />;
}
