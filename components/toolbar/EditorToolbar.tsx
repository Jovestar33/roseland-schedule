'use client';
import { useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsStore } from '@/lib/store/cmsStore';
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
  const openCmsModal = useCmsStore((s) => s.openModal);
  const [teamCopied,   setTeamCopied]   = useState(false);
  const [clientCopied, setClientCopied] = useState(false);

  function handleTeamLink() {
    if (!scheduleName) return;
    const url = `${window.location.origin}/schedule/${encodeURIComponent(scheduleName)}?auth=true`;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy team link:', url));
    setTeamCopied(true);
    setTimeout(() => setTeamCopied(false), 2500);
  }

  function handleClientLink() {
    if (!scheduleName) return;
    const url = `${window.location.origin}/view/${encodeURIComponent(scheduleName)}`;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy client link:', url));
    setClientCopied(true);
    setTimeout(() => setClientCopied(false), 2500);
  }

  return (
    <div className="toolbar">
      <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
      <SyncStatusPill />
      <button className="btn btn-light btn-sm" onClick={onSave}>&#128190; Save</button>
      <button className="btn btn-light btn-sm" onClick={onOpenSaveAs}>Save As&hellip;</button>
      <UndoRedoButtons />
      <button className="btn btn-light btn-sm" onClick={() => window.print()}>&#128438; Print</button>
      <button className="btn btn-light btn-sm" onClick={onSnapshot}>&#128247; Snapshot</button>
      <button className="btn btn-light btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
      {scheduleName && (
        <button className="btn btn-light btn-sm" onClick={handleTeamLink}>
          {teamCopied ? '✓ Copied!' : '🔗 Copy Team Link'}
        </button>
      )}
      {scheduleName && (
        <button
          className="btn btn-sm"
          onClick={handleClientLink}
          style={{ background: clientCopied ? '#bbf7d0' : '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
        >
          {clientCopied ? '✓ Copied!' : '🔒 Copy Client Link'}
        </button>
      )}
      <button className="btn btn-light btn-sm" onClick={onClose}>Close Schedule</button>
    </div>
  );
}
