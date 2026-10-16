'use client';
import { useRef, useState } from 'react';
import Modal from '@/components/modals/Modal';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { allowedDurationsForRow, rowConflictInfo, maxDurationForRow, parseCustomDuration, durm, mDur } from '@/lib/time';
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
  const allowed  = allowedDurationsForRow(rows, index);
  const opts     = allowed.includes(row.dur) ? allowed : [...allowed, row.dur].filter(Boolean);
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
    const max = maxDurationForRow(rows, index);
    if (max !== null && durm(dur) > max) {
      setError(`Maximum ${mDur(max) || '00:00'} before the locked time.`); return;
    }
    handleChange(dur);
    closeCustom();
  }

  return (
    <>
      <select
        ref={selectRef}
        aria-label="Duration"
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
      {conflict && <div className="dur-warn">{conflict.msg}</div>}
    </>
  );
}
