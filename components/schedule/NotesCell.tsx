'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import AutoResizeTextarea from './AutoResizeTextarea';

interface Props {
  index: number;
  row: ScheduleRow;
  onOpenStatus: () => void;
  onOpenNotes: () => void;
}

export default function NotesCell({ index, row, onOpenStatus, onOpenNotes }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const hasStatus = !!row.status;

  return (
    <div className="notes-status-wrap">
      <div className="status-icon-slot">
        <button
          className={`status-mini-btn${hasStatus ? ' has-status' : ''}`}
          onClick={onOpenStatus}
          title={hasStatus ? 'Edit booking status' : 'Add booking status'}
        >&#10003;</button>
      </div>
      <div className="status-notes-slot">
        <AutoResizeTextarea
          className="ci-ta"
          value={row.notes}
          onChange={(notes) => updateRow(index, { notes })}
          onFocus={pushUndo}
          placeholder="Notes…"
        />
        {row.notes && (
          <div className="print-field-text" aria-hidden="true">
            {row.notes}
          </div>
        )}
      </div>
    </div>
  );
}
