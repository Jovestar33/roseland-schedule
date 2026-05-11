'use client';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { useScheduleStore } from '@/lib/store/scheduleStore';

interface Props {
  index: number;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
}

export default function RowControls({ index, dragHandleProps }: Props) {
  const rows       = useScheduleStore((s) => s.rows);
  const pushUndo   = useScheduleStore((s) => s.pushUndo);
  const reorderRows = useScheduleStore((s) => s.reorderRows);
  const total = rows.length;

  function moveUp() {
    if (index === 0) return;
    pushUndo();
    reorderRows(index, index - 1);
  }

  function moveDown() {
    if (index >= total - 1) return;
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
        ⠿
      </span>
      <div className="move-btns">
        <button className="move-btn" onClick={moveUp} disabled={index === 0} title="Move up">▲</button>
        <button className="move-btn" onClick={moveDown} disabled={index >= total - 1} title="Move down">▼</button>
      </div>
      <span>{index + 1}</span>
    </>
  );
}
