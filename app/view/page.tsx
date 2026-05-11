import ReadOnlyViewer from '@/components/view/ReadOnlyViewer';

interface Props {
  searchParams: Promise<{ v?: string; vt?: string }>;
}

export default async function ViewPage({ searchParams }: Props) {
  const { v, vt } = await searchParams;
  return <ReadOnlyViewer name={v ?? ''} viewToken={vt ?? ''} />;
}
