'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCmsStore } from '@/lib/store/cmsStore';
import type { SchedulePrintRequest } from '@/lib/print';
import { layoutSchedulePrint, renderSchedulePrint, type SchedulePaper, type SchedulePrintMode, type PrintLayout } from '@/lib/schedule-print-layout';
import styles from './schedule-print.module.css';

export default function SchedulePrintProvider() {
  const logo = useCmsStore(state => state.config.logo);
  const [request, setRequest] = useState<SchedulePrintRequest | null>(null);
  const [mode, setMode] = useState<SchedulePrintMode>('compact');
  const [paper, setPaper] = useState<SchedulePaper>('letter');
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [html, setHtml] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      previousFocus.current = document.activeElement as HTMLElement;
      setMode('compact'); setError(''); setReady(false); setLayout(null);
      setRequest((event as CustomEvent<SchedulePrintRequest>).detail);
    };
    window.addEventListener('schedule-print-preview', open);
    return () => window.removeEventListener('schedule-print-preview', open);
  }, []);
  useEffect(() => {
    if (!request) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setRequest(null); previousFocus.current?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [request]);
  useEffect(() => {
    if (!request) return;
    setReady(false); setError('');
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Print preview is unavailable in this browser.');
      const next = layoutSchedulePrint(request.data, request.name, mode, paper, (text, bold, size) => {
        context.font = `${bold ? 'bold ' : ''}${size}px Arial`;
        return context.measureText(text).width;
      });
      setLayout(next);
      setHtml(renderSchedulePrint(next, new URL(logo || '/logo-header.png', window.location.href).href).replace('<head>', '<head><base href="about:srcdoc">'));
    } catch (err) { setLayout(null); setError((err as Error).message); }
  }, [request, mode, paper, logo]);
  async function print() {
    if (!request || !ready || !frame.current?.contentWindow) return;
    setBusy(true); setError('');
    try {
      if (request.authorize && !await request.authorize()) {
        setError('Access could not be confirmed. Close this preview and reopen the schedule before printing.'); return;
      }
      const target = frame.current?.contentWindow;
      if (!target) return;
      await target.document.fonts.ready;
      target.focus(); target.print();
    } catch { setError('Printing could not start. Please try again.'); }
    finally { setBusy(false); }
  }
  if (!request) return null;
  return createPortal(<div className={styles.overlay}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="schedule-print-title">
      <header className={styles.header}><h2 id="schedule-print-title">Print / PDF</h2><button ref={close} type="button" onClick={() => { setRequest(null); previousFocus.current?.focus(); }}>Close</button></header>
      <div className={styles.controls}>
        <label>Layout <select value={mode} onChange={event => setMode(event.target.value as SchedulePrintMode)}>
          <option value="compact">Compact schedule + full notes</option><option value="inline">All details inline</option>
        </select></label>
        <label>Paper <select value={paper} onChange={event => setPaper(event.target.value as SchedulePaper)}><option value="letter">US Letter · landscape</option><option value="a4">A4 · landscape</option></select></label>
        <button type="button" className="btn btn-pink" disabled={!ready || !layout || busy} onClick={() => void print()}>{busy ? 'Preparing…' : 'Print / Save PDF'}</button>
      </div>
      <p className={styles.help}>Key instructions always stay in the schedule. Longer supporting text is included in full. Screen expanders do not affect this export.</p>
      <p className={styles.help}>Use the selected paper size, landscape, 100% scale, and no browser headers or footers to match this preview.</p>
      <p className={styles.count} role="status">{layout ? `${layout.schedulePages} schedule ${layout.schedulePages === 1 ? 'page' : 'pages'} + ${layout.notesPages} notes ${layout.notesPages === 1 ? 'page' : 'pages'} · ${layout.pages.length} total` : 'Preparing preview…'}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {layout && <iframe ref={frame} title="Schedule print preview" className={styles.preview} srcDoc={html} onLoad={() => setReady(true)} />}
    </section>
  </div>, document.body);
}
