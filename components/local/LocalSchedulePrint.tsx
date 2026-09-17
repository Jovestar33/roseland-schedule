'use client';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import ScheduleReadView from '@/components/view/ScheduleReadView';

export default function LocalSchedulePrint({ visible }: { visible: boolean }) {
  const meta = useScheduleStore(s => s.meta), rows = useScheduleStore(s => s.rows), name = useScheduleStore(s => s.scheduleName);
  if (!visible || typeof document === 'undefined') return null;
  return createPortal(<div className="local-schedule-print">
    <header className="hdr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-header.png" alt="Roseland Pictures" />
      <span className="hdr-title">Production Schedule</span>
    </header>
    <ScheduleReadView data={{meta,rows,savedAt:0}} name={name ?? undefined} />
  </div>, document.body);
}
