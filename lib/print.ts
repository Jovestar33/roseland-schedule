export function printSchedule(scheduleName: string, date?: string) {
  const prev = document.title;
  let title = scheduleName || 'Schedule';
  if (date) {
    const d = new Date(date + 'T12:00:00');
    const friendly = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    title = `${scheduleName} - ${friendly} - ${date}`;
  }
  document.title = title;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
