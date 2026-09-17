'use client';
import { useRef, useState, useEffect, useContext } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { printSchedule, printDocument } from '@/lib/print';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';
import { ModalVisibilityContext } from '@/components/modals/Modal';
import ContactSheetModal from '@/components/modals/ContactSheetModal';
import CallSheetModal from '@/components/modals/CallSheetModal';

export default function ShareDropdown({ readOnly = false, onModalChange }: { readOnly?: boolean; onModalChange?: (open: boolean) => void } = {}) {
  const local = useLocalEditor(), visible = useContext(ModalVisibilityContext);
  const scheduleName    = useScheduleStore((s) => s.scheduleName);
  const getScheduleData = useScheduleStore((s) => s.getScheduleData);
  const [open, setOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [callSheetOpen,    setCallSheetOpen   ] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => { onModalChange?.(callSheetOpen || contactSheetOpen); }, [callSheetOpen, contactSheetOpen, onModalChange]);
  useEffect(() => { if (!visible) setOpen(false); }, [visible]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  function close() { setOpen(false); }

  function handlePrint() {
    close();
    if (local) void printDocument(scheduleName ?? 'Schedule', 'schedule', true);
    else void printSchedule(scheduleName ?? 'Schedule');
  }

  function handleContactSheet() {
    close();
    setContactSheetOpen(true);
  }

  function handleCallSheet() {
    close();
    setCallSheetOpen(true);
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
    <>
    <div className="tbar-drop-wrap" ref={wrapRef}>
      <button
        className="btn btn-light btn-sm"
        ref={btnRef}
        onClick={toggle}
        title="Share"
      >
        <span className="tbar-icon">⬆</span>
        <span className="tbar-label"> Share</span>
        <span className={`tbar-chev${open ? ' open' : ''}`}> ▾</span>
      </button>
      {open && (
        <div
          className="tbar-drop"
          style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, left: 'auto', zIndex: 9999 }}
        >
          <button className="tbar-drop-item" onClick={handlePrint}>🖨 Print / PDF</button>
          {!local && <button className="tbar-drop-item" onClick={handleExportJson}>⬇ Export JSON</button>}
          <button className="tbar-drop-item" onClick={handleContactSheet}>📋 Contact Sheet</button>
          <button className="tbar-drop-item" onClick={handleCallSheet}>📄 Call Sheet</button>
        </div>
      )}
    </div>
    <ContactSheetModal
      open={contactSheetOpen}
      onClose={() => setContactSheetOpen(false)}
    />
    <CallSheetModal
      open={callSheetOpen}
      readOnly={readOnly}
      onClose={() => setCallSheetOpen(false)}
    />
</>
  );
}
