'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import SyncStatusPill from './SyncStatusPill';
import UndoRedoButtons from './UndoRedoButtons';

export default function EditorToolbar() {
  const scheduleName = useScheduleStore((s) => s.scheduleName);

  return (
    <div className="toolbar">
      <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
      <SyncStatusPill />
      <UndoRedoButtons />
    </div>
  );
}
