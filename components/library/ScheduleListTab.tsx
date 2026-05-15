'use client';
import type { ScheduleData } from '@/lib/types';
import LibraryTree from './LibraryTree';

export interface LibrarySchedule {
  name: string;
  data: ScheduleData | null;
  loading: boolean;
}

interface Props {
  schedules: LibrarySchedule[];
  onDelete: (name: string) => void;
}

export default function ScheduleListTab({ schedules, onDelete }: Props) {
  return <LibraryTree schedules={schedules} onDelete={onDelete} />;
}
