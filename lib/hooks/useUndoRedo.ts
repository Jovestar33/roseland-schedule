import { useScheduleStore } from '../store/scheduleStore';

export function useUndoRedo() {
  const pushUndo = useScheduleStore((s) => s.pushUndo);
  const undo = useScheduleStore((s) => s.undo);
  const redo = useScheduleStore((s) => s.redo);
  const canUndo = useScheduleStore((s) => s.undoStack.length > 0);
  const canRedo = useScheduleStore((s) => s.redoStack.length > 0);

  return { pushUndo, undo, redo, canUndo, canRedo };
}
