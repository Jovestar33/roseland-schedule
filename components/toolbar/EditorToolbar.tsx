'use client';
import { useState } from 'react';
import { PanelRight } from 'lucide-react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import SyncStatusPill from './SyncStatusPill';
import UndoRedoButtons from './UndoRedoButtons';
import SaveDropdown from './SaveDropdown';
import ShareDropdown from './ShareDropdown';
import ToolsPanel from './ToolsPanel';

interface Props {
  onSave: () => void;
  onOpenSaveAs: () => void;
  onSnapshot: () => void;
  onClose: () => void;
}

export default function EditorToolbar({ onSave, onOpenSaveAs, onSnapshot, onClose }: Props) {
  const scheduleName  = useScheduleStore((s) => s.scheduleName);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-head">
          <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
          <SyncStatusPill />
        </div>
        <div className="toolbar-btns">
          <SaveDropdown onSave={onSave} onSaveAs={onOpenSaveAs} onSnapshot={onSnapshot} />
          <UndoRedoButtons />
          <ShareDropdown />
          <button
            className={`btn btn-light btn-sm tbar-tools${toolsOpen ? ' tp-open' : ''}`}
            onClick={() => setToolsOpen((o) => !o)}
            title="Tools"
            aria-label="Tools"
          >
            <PanelRight size={15} aria-hidden />
            <span className="tbar-btn-text">Tools</span>
          </button>
          <button className="btn btn-light btn-sm tbar-close" onClick={onClose} title="Close" aria-label="Close">
            <span className="tbar-btn-text">Close</span>
            <span className="tbar-close-icon" aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      <ToolsPanel open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  );
}
