'use client';
import { useEffect, useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { allowedDurationsForRow, durm, mDur, rowConflictInfo } from '@/lib/time';
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
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState(row.dur);
  useEffect(() => { if (!custom) setCustomValue(row.dur); }, [row.dur, custom]);

  function handleChange(dur: string) {
    pushUndo();
    updateRow(index, { dur });
  }
  function saveCustomDuration() {
    if (!/^\d{1,2}:[0-5]\d$/.test(customValue)) return;
    const normalized=mDur(durm(customValue));
    if (normalized) handleChange(normalized);
  }

  return (
    <>
      <select
        className={`cs${disabled ? ' locked' : ''}${conflict ? ' time-conflict' : ''}`}
        value={custom ? '__custom__' : row.dur}
        disabled={disabled}
        onChange={(e) => { if(e.target.value==='__custom__'){setCustom(true);setCustomValue(row.dur);return;}setCustom(false);handleChange(e.target.value);}}
      >
        <option value="">—</option>
        {opts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
        <option value="__custom__">Custom duration…</option>
      </select>
      {custom&&<label className="custom-duration">Custom duration <input aria-label="Custom duration" inputMode="numeric" pattern="\d{1,2}:[0-5]\d" placeholder="01:05" value={customValue} onChange={e=>setCustomValue(e.target.value)} onBlur={saveCustomDuration} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveCustomDuration();}}}/><small>Hours:minutes</small></label>}
      {conflict && <div className="dur-warn">{conflict.msg}</div>}
    </>
  );
}
