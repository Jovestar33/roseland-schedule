'use client';
import { useState, useEffect } from 'react';
import Modal from './Modal';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  open: boolean;
  row: ScheduleRow | null;
  onSave: (status: string) => void;
  onClose: () => void;
}

export default function StatusModal({ open, row, onSave, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (row && open) setValue(row.status);
  }, [row, open]);

  function handleSave() {
    onSave(value.trim());
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Booking Status"
      className="status-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave}>Save</button>
        </>
      }
    >
      <span className="status-label">Notes on booking, confirmations, special instructions</span>
      <textarea
        autoFocus
        className="ci-ta status-ta"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Confirmed — awaiting signed contract. Contact: Sarah @ 555-0100."
        rows={6}
      />
    </Modal>
  );
}
