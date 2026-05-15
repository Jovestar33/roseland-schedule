'use client';
import { useRef, useState, useEffect } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { printSchedule } from '@/lib/print';

export default function ShareDropdown() {
  const scheduleName    = useScheduleStore((s) => s.scheduleName);
  const getScheduleData = useScheduleStore((s) => s.getScheduleData);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  function close() { setOpen(false); }

  function handlePrint() {
    close();
    printSchedule(scheduleName ?? 'Schedule');
  }

  function handleExportJson() {
    close();
    const data  = getScheduleData();
    const name  = scheduleName ?? 'Schedule';
    const today = new Date().toISOString().slice(0, 10);
    const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `${name} – ${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tbar-drop-wrap" ref={ref}>
      <button
        className="btn btn-light btn-sm"
        onClick={() => setOpen(o => !o)}
        title="Share"
      >
        <span className="tbar-icon">⬆</span>
        <span className="tbar-label"> Share</span>
        <span className={`tbar-chev${open ? ' open' : ''}`}> ▾</span>
      </button>
      {open && (
        <div className="tbar-drop tbar-drop-right">
          <button className="tbar-drop-item" onClick={handlePrint}>🖨 Print / PDF</button>
          <button className="tbar-drop-item" onClick={handleExportJson}>⬇ Export JSON</button>
        </div>
      )}
    </div>
  );
}
