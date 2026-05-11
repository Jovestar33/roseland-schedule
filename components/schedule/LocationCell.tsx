'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import AutoResizeTextarea from './AutoResizeTextarea';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function LocationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  return (
    <div className="loc-wrap">
      <AutoResizeTextarea
        className="ci-ta"
        value={row.loc}
        onChange={(loc) => updateRow(index, { loc })}
        onFocus={pushUndo}
        placeholder="Location…"
      />
    </div>
  );
}
