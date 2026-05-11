'use client';
import { ACTIONS, ACTION_CLASS_MAP } from '@/lib/constants';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function ActionCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const isOther = row.action === 'Other';

  function handleSelectChange(action: string) {
    pushUndo();
    updateRow(index, { action });
  }

  function handleBackClick() {
    pushUndo();
    updateRow(index, { action: '', otherText: '' });
  }

  if (isOther) {
    return (
      <div className="other-wrap">
        <input
          className={`other-inp-inline cs aOther`}
          type="text"
          value={row.otherText}
          onChange={(e) => updateRow(index, { otherText: e.target.value })}
          onFocus={pushUndo}
          placeholder="Describe…"
        />
        <button className="other-back" onClick={handleBackClick} title="Change action">↩</button>
      </div>
    );
  }

  const colorClass = ACTION_CLASS_MAP[row.action] ?? '';

  return (
    <select
      className={`cs${colorClass ? ` ${colorClass}` : ''}`}
      value={row.action}
      onChange={(e) => handleSelectChange(e.target.value)}
    >
      {ACTIONS.map((a) => (
        <option key={a} value={a}>{a || '—'}</option>
      ))}
    </select>
  );
}
