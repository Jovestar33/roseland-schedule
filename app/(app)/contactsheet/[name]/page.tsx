import ContactSheetEditor from '@/components/sheets/ContactSheetEditor';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function ContactSheetPage({ params }: Props) {
  const { name } = await params;
  return <ContactSheetEditor name={decodeURIComponent(name)} />;
}
