'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import AutoResizeTextarea from './AutoResizeTextarea';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function DescriptionCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  return (
    <>
      <AutoResizeTextarea
        className="ci-ta"
        value={row.desc}
        onChange={(desc) => updateRow(index, { desc })}
        onFocus={pushUndo}
        placeholder="Description…"
      />
      {row.desc && (
        <div className="print-field-text" aria-hidden="true">
          {row.desc}
        </div>
      )}
    </>
  );
}
