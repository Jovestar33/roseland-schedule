export async function printSchedule(scheduleName: string) {
  const prev = document.title;
  const today = new Date().toISOString().slice(0, 10);
  document.title = `${scheduleName || 'Schedule'} – ${today}`;
  // Wait for web fonts (Bebas Neue, DM Sans) to finish loading before opening
  // the print dialog. Without this, the print engine sometimes captures the page
  // before the font is ready and falls back to a system font, causing blurry text.
  await document.fonts.ready;
  window.print();
  setTimeout(() => { document.title = prev; }, 100);
}

/** Print existing document portals, isolating only the opt-in local workspace. */
export async function printDocument(name: string, kind: 'schedule' | 'contacts' | 'callsheet', local = false) {
  const previous = document.title;
  const className = kind === 'contacts' ? 'cs-printing' : kind === 'callsheet' ? 'callsheet-printing' : '';
  document.title = `${name || 'Schedule'} - ${kind}`;
  if (className) document.body.classList.add(className);
  if (local) document.body.dataset.localDocument = kind;
  const cleanup = () => {
    if (className) document.body.classList.remove(className);
    if (local) delete document.body.dataset.localDocument;
    document.title = previous;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  try {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.print();
  } catch (error) { cleanup(); throw error; }
}
