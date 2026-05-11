'use client';
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
      <button
        className={`time-lock-btn out${row.fixedOut ? ' active' : ''}`}
        onClick={toggleFixedOut}
        title={row.fixedOut ? 'Unlock time-out' : 'Lock time-out'}
      />
      {row.fixedOut ? (
        <select
          className="cs"
          value={row.fixedOutTime}
          onChange={(e) => handleTimeChange(e.target.value)}
        >
          <option value="">—</option>
          {TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : (
        <span className={`tdsp${displayTime ? ' tout' : ''}`}>
          {displayTime || '—'}
        </span>
      )}
    </div>
  );
}
