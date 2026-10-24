'use client';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useToast } from '@/components/ui/ToastProvider';

interface Props {
  index: number;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
}

export default function RowControls({ index, dragHandleProps }: Props) {
  const rows        = useScheduleStore((s) => s.rows);
  const pushUndo    = useScheduleStore((s) => s.pushUndo);
  const reorderRows = useScheduleStore((s) => s.reorderRows);
  const { addToast } = useToast();
  const editable = rows.flatMap((row, i) => row.sunLocked ? [] : [i]);
  const position = editable.indexOf(index);
  const canMoveUp = position > 1;
  const canMoveDown = position > 0 && position < editable.length - 1;

  function guardReorder(): boolean {
    if (rows.some(r => !r.sunLocked && r.action !== '' && r.dur === '')) {
      addToast('Fill in Duration on all actions before reordering', 'info');
      return true;
    }
    return false;
  }

  function moveUp() {
    if (!canMoveUp) return;
    if (guardReorder()) return;
    pushUndo();
    reorderRows(index, editable[position - 1]);
  }

  function moveDown() {
    if (!canMoveDown) return;
    if (guardReorder()) return;
    pushUndo();
    reorderRows(index, editable[position + 1]);
  }

  return (
    <>
      <span
        className="drag-handle"
        {...(dragHandleProps ?? {})}
        title={position === 0 ? "Call-time anchor" : "Drag to reorder"}
        aria-label={position === 0 ? "Call-time anchor" : `Reorder action ${position + 1}`}
      >
        ≡
      </span>
      <div className="move-btns">
        <button className="move-btn" onClick={moveUp} disabled={!canMoveUp} title="Move up">▲</button>
        <button className="move-btn" onClick={moveDown} disabled={!canMoveDown} title="Move down">▼</button>
      </div>
      <span>{index + 1}</span>
    </>
  );
}
