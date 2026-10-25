import type { ScheduleData } from './types';
export interface SchedulePrintRequest { name: string; data: ScheduleData; authorize?: () => Promise<boolean>; castUnderDescription?:boolean; logo?:string }
/** Open a deterministic, paginated preview; screen expansion state is irrelevant. */
export async function printSchedule(name: string, data: ScheduleData, authorize?: () => Promise<boolean>, castUnderDescription=false, logo?:string) {
  window.dispatchEvent(new CustomEvent<SchedulePrintRequest>('schedule-print-preview', {
    detail: { name, data: structuredClone(data), authorize, castUnderDescription, logo },
  }));
}

let finishActiveDocumentPrint:(()=>void)|null=null;

/** Print existing document portals, isolating only the opt-in local workspace. */
export async function printDocument(name: string, kind: 'schedule' | 'contacts' | 'callsheet', local = false, isCurrent:()=>boolean=()=>true) {
  if(!isCurrent())return;
  finishActiveDocumentPrint?.();
  let finished=false;
  const previous = document.title;
  const previousFocus = document.activeElement as HTMLElement | null;
  const className = kind === 'contacts' ? 'cs-printing' : kind === 'callsheet' ? 'callsheet-printing' : '';
  document.title = `${name || 'Schedule'} - ${kind}`;
  if (className) document.body.classList.add(className);
  if (local) document.body.dataset.localDocument = kind;
  const cleanup = () => {
    if(finished)return;finished=true;
    if(finishActiveDocumentPrint===cleanup)finishActiveDocumentPrint=null;
    if (className) document.body.classList.remove(className);
    if (local) delete document.body.dataset.localDocument;
    document.title = previous;
    window.removeEventListener('afterprint', cleanup);
    if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
  };
  finishActiveDocumentPrint=cleanup;
  window.addEventListener('afterprint', cleanup);
  try {
    await document.fonts.ready;
    if(finished||!isCurrent()){cleanup();return;}
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if(finished||!isCurrent()){cleanup();return;}
    window.print();
  } catch (error) { cleanup(); throw error; }
}
