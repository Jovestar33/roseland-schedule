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
