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
  const [previewRevision, setPreviewRevision] = useState(0);
  const currentPreviewRevision = useRef(previewRevision); currentPreviewRevision.current = previewRevision;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0), printing = useRef(false);
  const currentRequest = useRef(request); currentRequest.current = request;
  const currentHtml = useRef(html); currentHtml.current = html;
  function cancelPrint() { generation.current++; printing.current=false; setBusy(false); setRequest(null); setReady(false); dialog.current?.close(); previousFocus.current?.focus(); }
  function invalidatePreview() { generation.current++; printing.current=false; setBusy(false); setReady(false); }
  const close = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      previousFocus.current = document.activeElement as HTMLElement;
      invalidatePreview();
      setMode('compact'); setError(''); setReady(false); setLayout(null);
      setRequest((event as CustomEvent<SchedulePrintRequest>).detail);
    };
    window.addEventListener('schedule-print-preview', open);
    window.addEventListener('schedule-print-close', cancelPrint);
    return () => { window.removeEventListener('schedule-print-preview', open); window.removeEventListener('schedule-print-close', cancelPrint); };
  }, []);
  useEffect(() => {
    if (!request) return;
    dialog.current?.showModal(); close.current?.focus();
    const activeGeneration=generation;
    return () => { activeGeneration.current++; printing.current=false; };
  }, [request]);
  useEffect(() => {
    if (!request) return;
    invalidatePreview(); setError('');
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Print preview is unavailable in this browser.');
      const next = layoutSchedulePrint(request.data, request.name, mode, paper, (text, bold, size) => {
        context.font = `${bold ? 'bold ' : ''}${size}px Arial`;
        return context.measureText(text).width;
      },request.castUnderDescription);
      setLayout(next);
      setPreviewRevision(value => value + 1);
      setHtml(renderSchedulePrint(next, new URL(logo || '/logo-header.png', window.location.href).href).replace('<head>', '<head><base href="about:srcdoc">'));
    } catch (err) { setLayout(null); setError((err as Error).message); }
  }, [request, mode, paper, logo]);
  async function print() {
    const target=frame.current?.contentWindow;
    if (!request || !ready || !target || printing.current) return;
    const expected=request, ticket=++generation.current;
    const current=()=>ticket===generation.current && currentRequest.current===expected && frame.current?.contentWindow===target;
    printing.current=true; setBusy(true); setError('');
    try {
      if (request.authorize && !await request.authorize()) {
        if(current())setError('Access could not be confirmed. Close this preview and reopen the schedule before printing.'); return;
      }
      if(!current())return;
      await target.document.fonts.ready;
      if(!current())return;
      target.focus(); target.print();
    } catch { if(current())setError('Printing could not start. Please try again.'); }
    finally { if(ticket===generation.current){printing.current=false;setBusy(false);} }
  }
  if (!request) return null;
  return createPortal(<dialog ref={dialog} className={styles.overlay} aria-labelledby="schedule-print-title" onCancel={event=>{event.preventDefault();cancelPrint();}}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="schedule-print-title">
      <header className={styles.header}><h2 id="schedule-print-title">Print / PDF</h2><button ref={close} type="button" onClick={cancelPrint}>Close</button></header>
      <div className={styles.controls}>
        <label>Layout <select value={mode} onChange={event => {invalidatePreview();setMode(event.target.value as SchedulePrintMode);}}>
          <option value="compact">Compact schedule + full notes</option><option value="inline">All details inline</option>
        </select></label>
        <label>Paper <select value={paper} onChange={event => {invalidatePreview();setPaper(event.target.value as SchedulePaper);}}><option value="letter">US Letter · landscape</option><option value="a4">A4 · landscape</option></select></label>
        <button type="button" className="btn btn-pink" disabled={!ready || !layout || busy} onClick={() => void print()}>{busy ? 'Preparing…' : 'Print / Save PDF'}</button>
      </div>
      <p className={styles.help}>All schedule details are included. In the compact layout, longer notes continue on separate pages.</p>
      <p className={styles.help}>Use the selected paper size, landscape, 100% scale, and no browser headers or footers to match this preview.</p>
      <p className={styles.count} role="status">{layout ? `${layout.schedulePages} schedule ${layout.schedulePages === 1 ? 'page' : 'pages'} + ${layout.notesPages} notes ${layout.notesPages === 1 ? 'page' : 'pages'} · ${layout.pages.length} total` : error ? 'Preview unavailable' : 'Preparing preview…'}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {layout && <iframe key={previewRevision} ref={frame} title="Schedule print preview" className={styles.preview} srcDoc={html} onLoad={() => {if(currentPreviewRevision.current===previewRevision&&currentHtml.current===html&&currentRequest.current===request)setReady(true);}} />}
    </section>
  </dialog>, document.body);
}
