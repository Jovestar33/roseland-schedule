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
  const total = rows.length;

  // Find the first reorderable index (one after the first non-sun row, matching original).
  const firstNonSun = rows.findIndex(r => !r.sunLocked);
  const firstReorderable = firstNonSun === -1 ? 0 : Math.min(firstNonSun + 1, Math.max(total - 1, 0));

  function guardReorder(): boolean {
    if (rows.some(r => !r.sunLocked && r.action !== '' && r.dur === '')) {
      addToast('Fill in Duration on all actions before reordering', 'info');
      return true;
    }
    return false;
  }

  function moveUp() {
    if (index < firstReorderable) return;
    if (guardReorder()) return;
    pushUndo();
    reorderRows(index, index - 1);
  }

  function moveDown() {
    if (index >= total - 1) return;
    if (guardReorder()) return;
    pushUndo();
    reorderRows(index, index + 1);
  }

  return (
    <>
      <span
        className="drag-handle"
        {...(dragHandleProps ?? {})}
        title="Drag to reorder"
      >
        ≡
      </span>
      <div className="move-btns">
        <button className="move-btn" onClick={moveUp} disabled={index < firstReorderable} title="Move up">▲</button>
        <button className="move-btn" onClick={moveDown} disabled={index >= total - 1} title="Move down">▼</button>
      </div>
      <span>{index + 1}</span>
    </>
  );
}
