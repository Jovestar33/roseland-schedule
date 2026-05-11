'use client';
import { TIMES } from '@/lib/time';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function TimeInCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);
  const rows      = useScheduleStore((s) => s.rows);

  const firstNonSun = rows.findIndex((r) => !r.sunLocked);
  const isFirstRow  = index === firstNonSun;

  if (row.sunLocked) {
    return (
      <div className="time-cell-wrap">
        <span className="anchor-text">{row.timeIn}</span>
      </div>
    );
  }

  function toggleFixedIn() {
    pushUndo();
    updateRow(index, { fixedIn: !row.fixedIn });
  }

  function handleTimeChange(timeIn: string) {
    pushUndo();
    updateRow(index, { timeIn });
  }

  const showSelect = isFirstRow || row.fixedIn;

  return (
    <div className="time-cell-wrap">
      <button
        className={`time-lock-btn in${row.fixedIn ? ' active' : ''}`}
        onClick={toggleFixedIn}
        title={row.fixedIn ? 'Unlock time-in' : 'Lock time-in'}
      />
      {showSelect ? (
        <select
          className="cs"
          value={row.timeIn}
          onChange={(e) => handleTimeChange(e.target.value)}
        >
          <option value="">— set —</option>
          {TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : (
        <span className="anchor-text">{row.timeIn || '—'}</span>
      )}
    </div>
  );
}
