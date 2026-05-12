import PublicViewer from '@/components/view/PublicViewer';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function PublicViewPage({ params }: Props) {
  const { name } = await params;
  return <PublicViewer name={decodeURIComponent(name)} />;
}
