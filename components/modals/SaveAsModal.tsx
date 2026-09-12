'use client';
import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  defaultName?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function SaveAsModal({ open, defaultName = '', onSave, onClose }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setSaving(false);
    setError('');
    if (open) setValue(defaultName);
    return () => { generation.current += 1; };
  }, [open, defaultName]);

  async function handleSave() {
    const name = value.trim();
    if (!name || pending.current) return;
    const current = generation.current;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(name);
      if (current === generation.current) onClose();
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      if (current === generation.current) { pending.current = false; setSaving(false); }
    }
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
      zIndex={10003}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave} disabled={saving || !value.trim()}>
            {saving ? 'Saving…' : 'Save'}
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
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ width: '100%', fontSize: '15px', padding: '9px 11px' }}
      />
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
