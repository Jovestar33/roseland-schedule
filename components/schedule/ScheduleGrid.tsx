'use client';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import ScheduleRow from './ScheduleRow';
import SunriseSunsetRow from './SunriseSunsetRow';

interface Props {
  onOpenContact: (index: number) => void;
  onOpenStatus: (index: number) => void;
  onOpenNotes: (index: number) => void;
}

export default function ScheduleGrid({ onOpenContact, onOpenStatus, onOpenNotes }: Props) {
  const rows        = useScheduleStore((s) => s.rows);
  const rowKeys     = useScheduleStore((s) => s.rowKeys);
  const reorderRows = useScheduleStore((s) => s.reorderRows);
  const pushUndo    = useScheduleStore((s) => s.pushUndo);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;
    pushUndo();
    reorderRows(from, to);
  }

  return (
    <div className="tbl-wrap">
      <DragDropContext onDragEnd={handleDragEnd}>
        <table className="sched">
          <colgroup>
            <col className="c-n" />
            <col className="c-a" />
            <col className="c-l" />
            <col className="c-d" />
            <col className="c-nt" />
            <col className="c-dv" />
            <col className="c-ti" />
            <col className="c-du" />
            <col className="c-to" />
            <col className="c-cb" />
            <col className="c-x" />
          </colgroup>
          <thead>
            <tr>
              <th />
              <th className="tp">Action</th>
              <th>Location</th>
              <th>Description</th>
              <th>Notes</th>
              <th className="col-dv" />
              <th className="tc tp">Time In</th>
              <th className="tc tp">Duration</th>
              <th className="tc tp">Time Out</th>
              <th className="tc">Done</th>
              <th />
            </tr>
          </thead>
          <Droppable droppableId="schedule">
            {(provided) => (
              <tbody ref={provided.innerRef} {...provided.droppableProps}>
                {rows.map((row, index) => {
                  const key = rowKeys[index];
                  if (row.sunLocked) {
                    return <SunriseSunsetRow key={key} index={index} row={row} />;
                  }
                  return (
                    <Draggable key={key} draggableId={key} index={index}>
                      {(draggable, snapshot) => (
                        <ScheduleRow
                          ref={draggable.innerRef}
                          draggableProps={draggable.draggableProps}
                          dragHandleProps={draggable.dragHandleProps}
                          isDragging={snapshot.isDragging}
                          index={index}
                          row={row}
                          onOpenContact={() => onOpenContact(index)}
                          onOpenStatus={() => onOpenStatus(index)}
                          onOpenNotes={() => onOpenNotes(index)}
                        />
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </tbody>
            )}
          </Droppable>
        </table>
      </DragDropContext>
    </div>
  );
}
