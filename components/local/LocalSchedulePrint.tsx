'use client';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import {useCmsStore,useCmsLabel} from '@/lib/store/cmsStore';
import ScheduleReadView from '@/components/view/ScheduleReadView';

export default function LocalSchedulePrint({ visible }: { visible: boolean }) {
  const logo=useCmsStore(s=>s.config.logo),subtitle=useCmsLabel('hdrTitle','Production Schedule');
  const meta = useScheduleStore(s => s.meta), rows = useScheduleStore(s => s.rows), name = useScheduleStore(s => s.scheduleName);
  if (!visible || typeof document === 'undefined') return null;
  return createPortal(<div className="local-schedule-print">
    <header className="hdr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo||"/logo-header.png"} alt="Organization logo" />
      <span className="hdr-title">{subtitle}</span>
    </header>
    <ScheduleReadView data={{meta,rows,savedAt:0}} name={name ?? undefined} />
  </div>, document.body);
}
