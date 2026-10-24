'use client';
import { forwardRef } from 'react';
import type { DraggableProvidedDragHandleProps, DraggableProvidedDraggableProps } from '@hello-pangea/dnd';
import { useCmsActionClassMap } from '@/lib/store/cmsStore';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow as ScheduleRowType } from '@/lib/types';
import ActionCell from './ActionCell';
import FlexibleTimeCell from './FlexibleTimeCell';
import TimeInCell from './TimeInCell';
import DurationCell from './DurationCell';
import TimeOutCell from './TimeOutCell';
import LocationCell from './LocationCell';
import DescriptionCell from './DescriptionCell';
import NotesCell from './NotesCell';
import DoneContactCell from './DoneContactCell';
import RowControls from './RowControls';

interface Props {
  index: number;
  row: ScheduleRowType;
  draggableProps: DraggableProvidedDraggableProps;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  isDragging: boolean;
  onOpenContact: () => void;
  onOpenStatus: () => void;
  onOpenNotes: () => void;
}

const ScheduleRow = forwardRef<HTMLTableRowElement, Props>(
  ({ index, row, draggableProps, dragHandleProps, isDragging, onOpenContact, onOpenStatus, onOpenNotes }, ref) => {
    const flexible = useScheduleStore(s=>s.timingEditor || s.meta.timing?.mode === 'flexible');
    const deleteRow = useScheduleStore((s) => s.deleteRow);
    const pushUndo  = useScheduleStore((s) => s.pushUndo);

    const actionClassMap = useCmsActionClassMap();
    const actionClass = actionClassMap[row.action] ?? '';
    const isInactive  = !row.action;

    const trClass = [
      actionClass,
      isInactive  ? 'inactive'   : '',
      row.done    ? 'completed'  : '',
      isDragging  ? 'dragging'   : '',
    ].filter(Boolean).join(' ') || undefined;

    function handleDelete() {
      pushUndo();
      deleteRow(index);
    }

    return (
      <tr ref={ref} className={trClass} {...draggableProps}>
        <td className="rn">
          <RowControls index={index} dragHandleProps={dragHandleProps} />
        </td>
        <td>
          <ActionCell index={index} row={row} />
        </td>
        <td>
          <LocationCell index={index} row={row} />
        </td>
        <td>
          <DescriptionCell index={index} row={row} />
        </td>
        <td>
          <NotesCell
            index={index}
            row={row}
            onOpenStatus={onOpenStatus}
            onOpenNotes={onOpenNotes}
          />
        </td>
        <td className="col-dv" />
        <td className="tc-t">
          {flexible?<FlexibleTimeCell index={index} row={row} edge="start"/>:<TimeInCell index={index} row={row} />}
        </td>
        <td className="tc-t">
          <DurationCell index={index} row={row} />
        </td>
        <td className="tc-t">
          {flexible?<FlexibleTimeCell index={index} row={row} edge="finish"/>:<TimeOutCell index={index} row={row} />}
        </td>
        <DoneContactCell index={index} row={row} onOpenContact={onOpenContact} onDelete={handleDelete} />
      </tr>
    );
  }
);

ScheduleRow.displayName = 'ScheduleRow';
export default ScheduleRow;
