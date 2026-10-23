'use client';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { TIMES, computeTimeOut } from '@/lib/time';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function TimeOutCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const displayTime = computeTimeOut(row);

  function toggleFixedOut() {
    pushUndo();
    if (row.fixedOut) {
      updateRow(index, { fixedOut: false, fixedOutTime: '' });
    } else {
      updateRow(index, { fixedOut: true, fixedOutTime: displayTime });
    }
  }

  function handleTimeChange(fixedOutTime: string) {
    pushUndo();
    updateRow(index, { fixedOutTime });
  }

  return (
    <div className="time-cell-wrap">
      {row.fixedOut ? (
        <select
          aria-label="Time out"
          className="cs"
          value={row.fixedOutTime}
          onChange={(e) => handleTimeChange(e.target.value)}
        >
          <option value="">— set —</option>
          {row.fixedOutTime && !TIMES.includes(row.fixedOutTime) && <option value={row.fixedOutTime}>{row.fixedOutTime}</option>}
          {TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : (
        <span className={`tdsp${displayTime ? ' tout' : ''}`}>
          {displayTime || '—'}
        </span>
      )}
      <button
        className={`time-lock-btn out${row.fixedOut ? ' active' : ''}`}
        onClick={toggleFixedOut}
          type="button"
          aria-pressed={!!row.fixedOut}
          aria-label={row.fixedOut ? 'Unlock time-out' : 'Lock time-out'}
        title={row.fixedOut ? 'Unlock time-out — let it follow the schedule' : 'Lock time-out — keep this time fixed; duration stays editable'}
      >
          {row.fixedOut ? <LockKeyhole size={14} aria-hidden="true" /> : <LockKeyholeOpen size={14} aria-hidden="true" />}
        </button>
    </div>
  );
}
