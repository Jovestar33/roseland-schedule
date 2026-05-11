'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
  onOpenContact: () => void;
}

export default function DoneContactCell({ index, row, onOpenContact }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const hasContact = !!(row.contactName || row.contactPhone || row.contactEmail);

  function handleDoneChange(done: boolean) {
    pushUndo();
    updateRow(index, { done });
  }

  return (
    <div className="done-tools">
      <input
        className="done-cb"
        type="checkbox"
        checked={row.done}
        onChange={(e) => handleDoneChange(e.target.checked)}
        title="Mark done"
      />
      <button
        className={`contact-done-btn${hasContact ? ' has-contact' : ''}`}
        onClick={onOpenContact}
        title={hasContact ? 'Edit contact' : 'Add contact'}
      >&#128100;</button>
    </div>
  );
}
