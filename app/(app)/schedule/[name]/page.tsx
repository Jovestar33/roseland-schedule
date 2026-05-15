import ScheduleEditor from '@/components/schedule/ScheduleEditor';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ proj?: string; ph?: string }>;
}

export default async function SchedulePage({ params, searchParams }: Props) {
  const { name } = await params;
  const sp = await searchParams;
  const initMeta = (sp.proj || sp.ph)
    ? { projectName: sp.proj ?? '', phase: sp.ph ?? '' }
    : undefined;
  return <ScheduleEditor name={decodeURIComponent(name)} initMeta={initMeta} />;
}
