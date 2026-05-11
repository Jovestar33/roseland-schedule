'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import PlacesAutocomplete from './PlacesAutocomplete';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function LocationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  function handleSelect(address: string, geo: GeoResult | null) {
    updateRow(index, {
      loc: address,
      locLat: geo?.lat ?? null,
      locLng: geo?.lng ?? null,
    });
  }

  return (
    <div className="loc-wrap">
      <PlacesAutocomplete
        className="ci-ta"
        value={row.loc}
        onChange={(loc) => updateRow(index, { loc })}
        onSelect={handleSelect}
        onFocus={pushUndo}
        placeholder="Location…"
        dropdownClass="loc-ac"
      />
    </div>
  );
}
