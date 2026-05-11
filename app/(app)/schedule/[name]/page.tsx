import ScheduleEditor from '@/components/schedule/ScheduleEditor';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function SchedulePage({ params }: Props) {
  const { name } = await params;
  return <ScheduleEditor name={decodeURIComponent(name)} />;
}
