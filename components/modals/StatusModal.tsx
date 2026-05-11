'use client';
import { useState, useEffect } from 'react';
import Modal from './Modal';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  open: boolean;
  row: ScheduleRow | null;
  onSave: (status: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function StatusModal({ open, row, onSave, onClear, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (row && open) setValue(row.status);
  }, [row, open]);

  function handleSave() {
    onSave(value.trim());
    onClose();
  }

  function handleClear() {
    onClear();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Status"
      className="status-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={handleClear}>Clear</button>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave}>Save Status</button>
        </>
      }
    >
      <textarea
        autoFocus
        className="ci-ta status-ta"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add booking progress, outreach status, confirmations, issues, next steps, or other status notes."
        rows={6}
      />
    </Modal>
  );
}
