'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';

export default function SyncStatusPill() {
  const dirty = useScheduleStore((s) => s.dirty);

  return (
    <span className={`sync-pill${dirty ? ' pending' : ' synced'}`}>
      <span className="dot" />
      {dirty ? 'Unsaved' : 'Saved'}
    </span>
  );
}
