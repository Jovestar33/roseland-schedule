'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';

const STATE_MAP: Record<string, { label: string; cls: string }> = {
  syncing:  { label: 'Syncing…', cls: 'syncing' },
  offline:  { label: 'Offline',       cls: 'offline'  },
  conflict: { label: 'Conflict',      cls: 'conflict' },
};

export default function SyncStatusPill() {
  const dirty      = useScheduleStore((s) => s.dirty);
  const syncStatus = useScheduleStore((s) => s.syncStatus);

  const active = STATE_MAP[syncStatus];
  const label  = active?.label  ?? (dirty ? 'Unsaved' : 'Saved');
  const cls    = active?.cls    ?? (dirty ? 'pending' : 'synced');

  return (
    <span className={`sync-pill ${cls}`}>
      <span className="dot" />
      <span className="txt">{label}</span>
    </span>
  );
}
