'use client';
import { useState, useEffect } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  notes: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}

export default function NotesModal({ open, notes, onSave, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(notes);
  }, [notes, open]);

  function handleSave() {
    onSave(value);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Notes"
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave}>Save</button>
        </>
      }
    >
      <textarea
        autoFocus
        className="ci-ta"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notes…"
        rows={8}
        style={{ minHeight: 160, resize: 'vertical' }}
      />
    </Modal>
  );
}
