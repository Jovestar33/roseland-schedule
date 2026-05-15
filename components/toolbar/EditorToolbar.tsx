'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import SyncStatusPill from './SyncStatusPill';
import UndoRedoButtons from './UndoRedoButtons';
import SaveDropdown from './SaveDropdown';
import ShareDropdown from './ShareDropdown';

interface Props {
  onSave: () => void;
  onOpenSaveAs: () => void;
  onSnapshot: () => void;
  onClose: () => void;
}

export default function EditorToolbar({ onSave, onOpenSaveAs, onSnapshot, onClose }: Props) {
  const scheduleName = useScheduleStore((s) => s.scheduleName);

  return (
    <div className="toolbar">
      <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
      <SyncStatusPill />
      <SaveDropdown onSave={onSave} onSaveAs={onOpenSaveAs} onSnapshot={onSnapshot} />
      <UndoRedoButtons />
      <ShareDropdown />
      <button className="btn btn-light btn-sm" onClick={onClose}>Close</button>
    </div>
  );
}
