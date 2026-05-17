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
  onArchive: (name: string) => void;
  onRestore: (name: string) => void;
  onDeletePermanently: (name: string) => void;
  onUpdateLibMeta: (updated: LibraryData) => Promise<void>;
}

export default function ScheduleListTab({
  schedules, libMeta,
  onArchive, onRestore, onDeletePermanently,
  onUpdateLibMeta,
}: Props) {
  return (
    <LibraryTree
      schedules={schedules}
      libMeta={libMeta}
      onArchive={onArchive}
      onRestore={onRestore}
      onDeletePermanently={onDeletePermanently}
      onUpdateLibMeta={onUpdateLibMeta}
    />
  );
}
