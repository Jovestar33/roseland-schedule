'use client';
import type { ScheduleData } from '@/lib/types';
import type { LibraryData } from '@/lib/api/library';
import LibraryTree from './LibraryTree';

export interface LibrarySchedule {
  name: string;
  data: ScheduleData | null;
  loading: boolean;
}

interface Props {
  schedules: LibrarySchedule[];
  libMeta: LibraryData;
  onDelete: (name: string) => void;
  onUpdateLibMeta: (updated: LibraryData) => Promise<void>;
}

export default function ScheduleListTab({ schedules, libMeta, onDelete, onUpdateLibMeta }: Props) {
  return (
    <LibraryTree
      schedules={schedules}
      libMeta={libMeta}
      onDelete={onDelete}
      onUpdateLibMeta={onUpdateLibMeta}
    />
  );
}
