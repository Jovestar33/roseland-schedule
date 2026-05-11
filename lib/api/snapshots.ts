import type { ScheduleData } from '../types';

export async function postAddSnapshot(
  name: string,
  data: ScheduleData,
  label: string,
  editorToken: string
): Promise<void> {
  await fetch('/.netlify/functions/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      snapshot: {
        id: crypto.randomUUID(),
        savedAt: Date.now(),
        label,
        data,
      },
      editorToken,
      action: 'add',
    }),
  });
}
