'use client';
import Modal from './Modal';
import type { ConflictState } from '@/lib/types';

interface Props {
  open: boolean;
  conflictData: ConflictState | null;
  onOverwrite: () => void;
  onSaveAs: () => void;
  onReload: () => void;
  onClose: () => void;
}

export default function ConflictModal({
  open,
  conflictData,
  onOverwrite,
  onSaveAs,
  onReload,
  onClose,
}: Props) {
  const remoteSavedAt = conflictData?.remote?.savedAt;
  const timeStr = remoteSavedAt
    ? new Date(remoteSavedAt).toLocaleString()
    : 'recently';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save Conflict"
      className="conflict-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-light" onClick={onSaveAs}>Save As Copy</button>
          <button className="btn btn-light" onClick={onReload}>Reload Remote</button>
          <button className="btn btn-pink" onClick={onOverwrite}>Overwrite</button>
        </>
      }
    >
      <p style={{ marginBottom: '12px', color: '#52525b', fontSize: '14px' }}>
        <strong>{conflictData?.scheduleName}</strong> was saved remotely ({timeStr}) since you
        opened it. Choose how to proceed:
      </p>
      <ul style={{ fontSize: '13px', color: '#52525b', paddingLeft: '18px', lineHeight: '1.8' }}>
        <li><strong>Overwrite</strong> — replace the remote version with your current changes</li>
        <li><strong>Save As Copy</strong> — save your version under a new name</li>
        <li><strong>Reload Remote</strong> — discard your changes and load the latest saved version</li>
      </ul>
    </Modal>
  );
}
