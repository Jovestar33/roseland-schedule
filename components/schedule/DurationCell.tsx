'use client';
import { DURATIONS } from '@/lib/time';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function DurationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const disabled = !row.action;

  function handleChange(dur: string) {
    pushUndo();
    updateRow(index, { dur });
  }

  return (
    <select
      className={`cs${disabled ? ' locked' : ''}`}
      value={row.dur}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="">—</option>
      {DURATIONS.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}
