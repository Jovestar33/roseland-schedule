'use client';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsLabel } from '@/lib/store/cmsStore';
import { useToast } from '@/components/ui/ToastProvider';
import ScheduleRow from './ScheduleRow';
import SunriseSunsetRow from './SunriseSunsetRow';

interface Props {
  onOpenContact: (index: number) => void;
  onOpenStatus: (index: number) => void;
  onOpenNotes: (index: number) => void;
}

// Check whether any non-sun row has an action but no duration (cascade cannot proceed).
function hasOpenRows(rows: ReturnType<typeof useScheduleStore.getState>['rows']): boolean {
  return rows.some(r => !r.sunLocked && r.action !== '' && !r.dur);
}

export default function ScheduleGrid({ onOpenContact, onOpenStatus, onOpenNotes }: Props) {
  const rows        = useScheduleStore((s) => s.rows);
  const rowKeys     = useScheduleStore((s) => s.rowKeys);
  const reorderRows = useScheduleStore((s) => s.reorderRows);
  const pushUndo    = useScheduleStore((s) => s.pushUndo);
  const { addToast } = useToast();

  const colAction   = useCmsLabel('colAction',   'Action');
  const colLocation = useCmsLabel('colLocation', 'Location');
  const colDesc     = useCmsLabel('colDesc',     'Description');
  const colNotes    = useCmsLabel('colNotes',    'Notes');
  const colTimeIn   = useCmsLabel('colTimeIn',   'Time In');
  const colDur      = useCmsLabel('colDuration', 'Duration');
  const colTimeOut  = useCmsLabel('colTimeOut',  'Time Out');
  const colDone     = useCmsLabel('colDone',     'Done');

  // Map a draggable-space index (counting only non-sun rows) to the actual rows array index.
  function draggableToActual(draggableIdx: number): number {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].sunLocked) {
        if (count === draggableIdx) return i;
        count++;
      }
    }
    return -1;
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === 0) {
      addToast('The first row is the call-time anchor and cannot be displaced.', 'info');
      return;
    }
    if (hasOpenRows(rows)) {
      addToast('Fill in Duration on all actions before reordering', 'info');
      return;
    }
    const from = draggableToActual(result.source.index);
    const to   = draggableToActual(result.destination.index);
    if (from < 0 || to < 0 || from === to) return;
    pushUndo();
    reorderRows(from, to);
  }

  // Assign sequential draggable indices to non-sun rows only.
  let draggableIdx = 0;

  return (
    <>
      <div className="scroll-hint"><span>&#8592; Scroll to see all columns &#8594;</span></div>
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
                <th className="tp">{colAction}</th>
                <th>{colLocation}</th>
                <th>{colDesc}</th>
                <th>{colNotes}</th>
                <th className="col-dv" />
                <th className="tc tp">{colTimeIn}</th>
                <th className="tc tp">{colDur}</th>
                <th className="tc tp">{colTimeOut}</th>
                <th className="tc">{colDone}</th>
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
                    const dIdx = draggableIdx++;
                    return (
                      <Draggable key={key} draggableId={key} index={dIdx}>
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
    </>
  );
}
