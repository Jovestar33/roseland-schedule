import type { ScheduleData } from './types';
export interface SchedulePrintRequest { name: string; data: ScheduleData; authorize?: () => Promise<boolean> }
/** Open a deterministic, paginated preview; screen expansion state is irrelevant. */
export async function printSchedule(name: string, data: ScheduleData, authorize?: () => Promise<boolean>) {
  window.dispatchEvent(new CustomEvent<SchedulePrintRequest>('schedule-print-preview', {
    detail: { name, data: structuredClone(data), authorize },
  }));
}

/** Print existing document portals, isolating only the opt-in local workspace. */
export async function printDocument(name: string, kind: 'schedule' | 'contacts' | 'callsheet', local = false) {
  const previous = document.title;
  const previousFocus = document.activeElement as HTMLElement | null;
  const className = kind === 'contacts' ? 'cs-printing' : kind === 'callsheet' ? 'callsheet-printing' : '';
  document.title = `${name || 'Schedule'} - ${kind}`;
  if (className) document.body.classList.add(className);
  if (local) document.body.dataset.localDocument = kind;
  const cleanup = () => {
    if (className) document.body.classList.remove(className);
    if (local) delete document.body.dataset.localDocument;
    document.title = previous;
    window.removeEventListener('afterprint', cleanup);
    if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
  };
  window.addEventListener('afterprint', cleanup);
  try {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.print();
  } catch (error) { cleanup(); throw error; }
}
