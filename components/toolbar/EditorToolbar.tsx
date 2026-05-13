'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsStore } from '@/lib/store/cmsStore';
import { printSchedule } from '@/lib/print';
import SyncStatusPill from './SyncStatusPill';
import UndoRedoButtons from './UndoRedoButtons';

interface Props {
  onSave: () => void;
  onOpenSaveAs: () => void;
  onSnapshot: () => void;
  onClose: () => void;
}

export default function EditorToolbar({ onSave, onOpenSaveAs, onSnapshot, onClose }: Props) {
  const scheduleName = useScheduleStore((s) => s.scheduleName);
  const meta         = useScheduleStore((s) => s.meta);
  const openCmsModal = useCmsStore((s) => s.openModal);

  return (
    <div className="toolbar">
      <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
      <SyncStatusPill />
      <button className="btn btn-light btn-sm" onClick={onSave}>&#128190; Save</button>
      <button className="btn btn-light btn-sm" onClick={onOpenSaveAs}>Save As&hellip;</button>
      <UndoRedoButtons />
      <button className="btn btn-light btn-sm" onClick={() => printSchedule(scheduleName ?? 'Schedule', meta?.date)}>&#128438; Print</button>
      <button className="btn btn-light btn-sm" onClick={onSnapshot}>&#128247; Snapshot</button>
      <button className="btn btn-light btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
      <button className="btn btn-light btn-sm" onClick={onClose}>Close Schedule</button>
    </div>
  );
}
