export function printSchedule(scheduleName: string, date?: string) {
  const prev = document.title;
  const today = new Date().toISOString().slice(0, 10);
  let title = scheduleName || 'Schedule';
  if (date) {
    const d = new Date(date + 'T12:00:00');
    const friendly = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    title = `${scheduleName} – ${friendly} – ${today}`;
  } else {
    title = `${scheduleName} – ${today}`;
  }
  document.title = title;
  window.print();
  setTimeout(() => { document.title = prev; }, 100);
}
