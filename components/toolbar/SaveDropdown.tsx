'use client';
import { useRef, useState, useEffect } from 'react';

interface Props {
  onSave: () => void;
  onSaveAs: () => void;
  onSnapshot: () => void;
}

export default function SaveDropdown({ onSave, onSaveAs, onSnapshot }: Props) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const chevRef = useRef<HTMLButtonElement>(null);

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

  function toggle() {
    if (!open && chevRef.current) {
      const r = chevRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }

  function pick(fn: () => void) { setOpen(false); fn(); }

  return (
    <div className="tbar-split" ref={wrapRef}>
      <button className="btn btn-light btn-sm tbar-split-main" onClick={onSave} title="Save">
        Save
      </button>
      <button
        className="btn btn-light btn-sm tbar-split-chev"
        ref={chevRef}
        onClick={toggle}
        aria-label="More save options"
        title="More save options"
      >
        <span className={`tbar-chev${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div
          className="tbar-drop"
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
        >
          <button className="tbar-drop-item" onClick={() => pick(onSaveAs)}>Save As…</button>
          <button className="tbar-drop-item" onClick={() => pick(onSnapshot)}>📷 Snapshot</button>
        </div>
      )}
    </div>
  );
}
