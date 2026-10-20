'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import KeyInstruction from './KeyInstruction';
import AutoResizeTextarea from './AutoResizeTextarea';
import fieldStyles from './key-instruction.module.css';

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
        {row.cast !== undefined && <div>
          <span className={fieldStyles.label}>Cast</span>
          <AutoResizeTextarea className="ci-ta" label="Cast" value={row.cast} onChange={(cast) => updateRow(index, { cast })} onFocus={pushUndo} placeholder="Cast…" />
          {row.cast && <div className="print-field-text" aria-hidden="true">Cast: {row.cast}</div>}
        </div>}
        <KeyInstruction value={row.keyInstruction} onChange={(keyInstruction) => updateRow(index, { keyInstruction })} onFocus={pushUndo} />
        <AutoResizeTextarea
          className="ci-ta"
          label="Notes"
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
