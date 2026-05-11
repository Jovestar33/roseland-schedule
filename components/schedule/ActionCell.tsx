'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsActions, useCmsActionClassMap } from '@/lib/store/cmsStore';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function ActionCell({ index, row }: Props) {
  const updateRow      = useScheduleStore((s) => s.updateRow);
  const pushUndo       = useScheduleStore((s) => s.pushUndo);
  const actions        = useCmsActions();
  const actionClassMap = useCmsActionClassMap();

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

  const colorClass = actionClassMap[row.action] ?? '';

  return (
    <select
      className={`cs${colorClass ? ` ${colorClass}` : ''}`}
      value={row.action}
      onChange={(e) => handleSelectChange(e.target.value)}
    >
      {actions.map((a) => (
        <option key={a} value={a}>{a || '—'}</option>
      ))}
    </select>
  );
}
