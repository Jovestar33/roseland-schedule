import CallSheetEditor from '@/components/sheets/CallSheetEditor';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function CallSheetPage({ params }: Props) {
  const { name } = await params;
  return <CallSheetEditor name={decodeURIComponent(name)} />;
}
