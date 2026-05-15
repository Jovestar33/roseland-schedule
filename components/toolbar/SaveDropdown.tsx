'use client';
import { useRef, useState, useEffect } from 'react';

interface Props {
  onSave: () => void;
  onSaveAs: () => void;
  onSnapshot: () => void;
}

export default function SaveDropdown({ onSave, onSaveAs, onSnapshot }: Props) {
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

  function pick(fn: () => void) { setOpen(false); fn(); }

  return (
    <div className="tbar-split" ref={ref}>
      <button className="btn btn-light btn-sm tbar-split-main" onClick={onSave} title="Save">
        Save
      </button>
      <button
        className="btn btn-light btn-sm tbar-split-chev"
        onClick={() => setOpen(o => !o)}
        aria-label="More save options"
        title="More save options"
      >
        <span className={`tbar-chev${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="tbar-drop">
          <button className="tbar-drop-item" onClick={() => pick(onSaveAs)}>Save As…</button>
          <button className="tbar-drop-item" onClick={() => pick(onSnapshot)}>📷 Snapshot</button>
        </div>
      )}
    </div>
  );
}
