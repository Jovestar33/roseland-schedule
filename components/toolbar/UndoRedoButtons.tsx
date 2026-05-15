'use client';
import { useUndoRedo } from '@/lib/hooks/useUndoRedo';

export default function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  return (
    <div className="btn-pair undo-redo-pair">
      <button
        className={`btn btn-light btn-sm${!canUndo ? ' undo-disabled' : ''}`}
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        ↩
      </button>
      <button
        className={`btn btn-light btn-sm${!canRedo ? ' undo-disabled' : ''}`}
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        ↪
      </button>
    </div>
  );
}
