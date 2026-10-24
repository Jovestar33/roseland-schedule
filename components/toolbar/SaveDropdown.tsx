'use client';
import { useRef, useState, useEffect, useId } from 'react';

interface Props {
  disabled?: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onSnapshot: () => void;
}

export default function SaveDropdown({ onSave, onSaveAs, onSnapshot, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, maxHeight: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const chevRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll(event?: Event) { if(event?.target && wrapRef.current?.contains(event.target as Node))return; setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setOpen(false); chevRef.current?.focus(); } }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.visualViewport?.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function toggle() {
    if (disabled) return;
    if (!open && chevRef.current) {
      const r = chevRef.current.getBoundingClientRect();
      const height=window.visualViewport?.height ?? window.innerHeight;
      const top=Math.max(8,Math.min(r.bottom+4,height-104));
      setDropPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 200)), maxHeight:Math.max(0,height-top-8) });
    }
    setOpen(o => !o);
  }

  function pick(fn: () => void) { if (disabled) return; setOpen(false); chevRef.current?.focus(); fn(); }

  return (
    <div className="tbar-split" ref={wrapRef}>
      <button className="btn btn-light btn-sm tbar-split-main" disabled={disabled} onClick={onSave} title="Save">
        Save
      </button>
      <button
        className="btn btn-light btn-sm tbar-split-chev"
        disabled={disabled}
        ref={chevRef}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="More save options"
        title="More save options"
      >
        <span className={`tbar-chev${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="tbar-drop"
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, maxHeight:dropPos.maxHeight, maxWidth:'calc(100vw - 16px)', overflowY:'auto', zIndex: 9999 }}
        >
          <button className="tbar-drop-item" onClick={() => pick(onSaveAs)}>Save As…</button>
          <button className="tbar-drop-item" onClick={() => pick(onSnapshot)}>📷 Snapshot</button>
        </div>
      )}
    </div>
  );
}
