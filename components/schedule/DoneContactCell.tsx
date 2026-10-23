'use client';
import { UserRound } from 'lucide-react';
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

  const hasContact = !!(row.contactName || row.contactPhone || row.contactEmail || row.contactTitle);

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
        aria-label={row.done ? 'Mark action not done' : 'Mark action done'}
        title="Done — marks this action complete without changing its timing. Uncheck to undo."
      />
      <button
        className={`contact-done-btn${hasContact ? ' has-contact' : ''}`}
        type="button"
        aria-label={hasContact ? 'Edit contact' : 'Add contact'}
        onClick={onOpenContact}
        title={hasContact ? 'Edit contact' : 'Add contact'}
      ><UserRound size={17} aria-hidden="true" /></button>
    </div>
  );
}
