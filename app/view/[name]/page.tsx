import PublicViewer from '@/components/view/PublicViewer';

interface Props {
  searchParams: Promise<{ vt?: string }>;
  params: Promise<{ name: string }>;
}

export default async function PublicViewPage({ params, searchParams }: Props) {
  const { name } = await params;
  const { vt } = await searchParams;
  return <PublicViewer name={name} viewToken={vt ?? ''} />;
}
