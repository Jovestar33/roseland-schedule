'use client';
import { useRef, useState } from 'react';
import Modal from '@/components/modals/Modal';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { DURATIONS, rowConflictInfo, parseCustomDuration } from '@/lib/time';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function DurationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);
  const rows      = useScheduleStore((s) => s.rows);

  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);
  const closeCustom = () => { setEditing(false); selectRef.current?.focus(); };

  const disabled = !row.action;
  const opts = DURATIONS.includes(row.dur) ? DURATIONS : [...DURATIONS, row.dur].filter(Boolean);
  const conflict = rowConflictInfo(rows, index);

  function handleChange(dur: string) {
    if (dur === '__custom__') {
      setCustom(row.dur); setError(''); setEditing(true); return;
    }
    if (dur === row.dur) return;
    pushUndo();
    updateRow(index, { dur });
  }

  function saveCustom() {
    const dur = parseCustomDuration(custom);
    if (dur === null) { setError('Enter whole minutes (20) or hours:minutes (01:20).'); return; }
    handleChange(dur);
    closeCustom();
  }

  return (
    <>
      <div className="time-cell-wrap duration-cell-wrap">
      <select
        ref={selectRef}
        aria-label="Duration"
        title="Duration — locked times stay fixed; conflicts are shown below."
        className={`cs${disabled ? ' locked' : ''}${conflict ? ' time-conflict' : ''}`}
        value={row.dur}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">—</option>
        {opts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>
      </div>
      {editing && <Modal open className="duration-modal" onClose={closeCustom} title="Custom duration" footer={<>
        <button className="btn btn-light" onClick={closeCustom}>Cancel</button>
        <button className="btn btn-pink" onClick={saveCustom}>Apply</button>
      </>}>
        <label>
          Minutes or hours:minutes
          <input autoFocus className="ci-ta" aria-label="Custom duration" type="text"
            value={custom} placeholder="20 or 01:20"
            onChange={e => { setCustom(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCustom(); } }} />
        </label>
        {error && <p role="alert" className="dur-warn">{error}</p>}
      </Modal>}
      {conflict && <div className="dur-warn" role="status" title={conflict.detail || conflict.msg}>{conflict.msg}</div>}
    </>
  );
}
