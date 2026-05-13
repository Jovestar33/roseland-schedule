export function printSchedule(scheduleName: string) {
  const prev = document.title;
  const today = new Date().toISOString().slice(0, 10);
  document.title = `${scheduleName || 'Schedule'} – ${today}`;
  window.print();
  setTimeout(() => { document.title = prev; }, 100);
}
