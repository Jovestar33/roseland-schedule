'use client';
import { useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useAuthStore } from '@/lib/store/authStore';
import { useCmsStore } from '@/lib/store/cmsStore';
import { getViewLink } from '@/lib/api/viewLink';
import SyncStatusPill from './SyncStatusPill';
import UndoRedoButtons from './UndoRedoButtons';

interface Props {
  onSave: () => void;
  onOpenSaveAs: () => void;
  onSnapshot: () => void;
  onClose: () => void;
}

export default function EditorToolbar({ onSave, onOpenSaveAs, onSnapshot, onClose }: Props) {
  const scheduleName  = useScheduleStore((s) => s.scheduleName);
  const token         = useAuthStore((s) => s.token);
  const openCmsModal  = useCmsStore((s) => s.openModal);
  const [viewLinkCopied, setViewLinkCopied] = useState(false);
  const [editLinkCopied, setEditLinkCopied] = useState(false);

  async function handleViewLink() {
    if (!scheduleName || !token) return;
    try {
      const url = await getViewLink(scheduleName, token);
      await navigator.clipboard.writeText(url).catch(() => prompt('Copy read-only link:', url));
      setViewLinkCopied(true);
      setTimeout(() => setViewLinkCopied(false), 2500);
    } catch (e) {
      alert((e as Error).message || 'Could not generate view link');
    }
  }

  function handleEditLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy edit link:', url));
    setEditLinkCopied(true);
    setTimeout(() => setEditLinkCopied(false), 2500);
  }

  return (
    <div className="toolbar">
      <span className="tbar-name">{scheduleName ?? 'Untitled'}</span>
      <SyncStatusPill />
      {scheduleName && (
        <span
          className="url-chip"
          onClick={handleEditLink}
          title="Copy edit link"
          style={{ cursor: 'pointer' }}
        >
          {editLinkCopied ? '✓ Copied!' : '🔗 Edit Link'}
        </span>
      )}
      <button className="btn btn-light btn-sm" onClick={onSave}>&#128190; Save</button>
      <button className="btn btn-light btn-sm" onClick={onOpenSaveAs}>Save As&hellip;</button>
      <UndoRedoButtons />
      <button className="btn btn-light btn-sm" onClick={() => window.print()}>&#128438; Print</button>
      <button className="btn btn-light btn-sm" onClick={onSnapshot}>&#128247; Snapshot</button>
      <button className="btn btn-light btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
      {scheduleName && (
        <button
          className="url-chip"
          onClick={handleViewLink}
          title="Copy read-only link for clients"
          style={{ background: viewLinkCopied ? '#bbf7d0' : '#dcfce7', color: '#166534', borderColor: '#86efac' }}
        >
          {viewLinkCopied ? '✓ Copied!' : '🔒 Client / Vendor Link'}
        </button>
      )}
      <button className="btn btn-light btn-sm" onClick={onClose}>Close Schedule</button>
    </div>
  );
}
