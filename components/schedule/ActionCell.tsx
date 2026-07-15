'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsActions, useCmsActionClassMap } from '@/lib/store/cmsStore';
import { isLocked } from '@/lib/time';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function ActionCell({ index, row }: Props) {
  const updateRow      = useScheduleStore((s) => s.updateRow);
  const pushUndo       = useScheduleStore((s) => s.pushUndo);
  const rows           = useScheduleStore((s) => s.rows);
  const actions        = useCmsActions();
  const actionClassMap = useCmsActionClassMap();

  const isOther  = row.action === 'Other';
  const locked   = isLocked(rows, index);
  const showHint = locked;

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
        {showHint && <div className="lock-hint">⏱ Set duration above</div>}
      </div>
    );
  }

  const colorClass = actionClassMap[row.action] ?? '';

  return (
    <>
      <div className="action-select-wrap">
        <select
          className={`cs action-select${colorClass ? ` ${colorClass}` : ''}${locked ? ' locked' : ''}`}
          value={row.action}
          onChange={(e) => handleSelectChange(e.target.value)}
        >
          {actions.map((a) => (
            <option key={a} value={a}>{a || '—'}</option>
          ))}
        </select>
      </div>
      {showHint && <div className="lock-hint">⏱ Set duration above</div>}
    </>
  );
}
