'use client';
import { useState, useEffect } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  defaultName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function SaveAsModal({ open, defaultName = '', onSave, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(defaultName);
  }, [open, defaultName]);

  function handleSave() {
    const name = value.trim();
    if (!name) return;
    onSave(name);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save As…"
      className="saveas-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave} disabled={!value.trim()}>
            Save
          </button>
        </>
      }
    >
      <input
        autoFocus
        className="ci"
        type="text"
        placeholder="Schedule name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ width: '100%', fontSize: '15px', padding: '9px 11px' }}
      />
    </Modal>
  );
}
