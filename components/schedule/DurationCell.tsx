'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { allowedDurationsForRow, rowConflictInfo } from '@/lib/time';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function DurationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);
  const rows      = useScheduleStore((s) => s.rows);

  const disabled = !row.action;
  const allowed  = allowedDurationsForRow(rows, index);
  const opts     = allowed.includes(row.dur) ? allowed : [...allowed, row.dur].filter(Boolean);
  const conflict = rowConflictInfo(rows, index);

  function handleChange(dur: string) {
    pushUndo();
    updateRow(index, { dur });
  }

  return (
    <>
      <select
        className={`cs${disabled ? ' locked' : ''}${conflict ? ' time-conflict' : ''}`}
        value={row.dur}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">—</option>
        {opts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      {conflict && <div className="dur-warn">{conflict.msg}</div>}
    </>
  );
}
