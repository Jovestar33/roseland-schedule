import {headers} from 'next/headers';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import LocalClientViewer from '@/components/view/LocalClientViewer';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer' as const};
import ReadOnlyViewer from '@/components/view/ReadOnlyViewer';

interface Props {
  searchParams: Promise<{ v?: string; vt?: string }>;
}

export default async function ViewPage({ searchParams }: Props) {
  const { v, vt } = await searchParams;
  if(readLocalWorkspaceConfig(process.env,(await headers()).get('host')))return <LocalClientViewer legacyName={v} legacyToken={vt}/>;
  return <ReadOnlyViewer name={v ?? ''} viewToken={vt ?? ''} />;
}
