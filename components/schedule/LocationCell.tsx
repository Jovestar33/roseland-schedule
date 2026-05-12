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

  function openMap() {
    const url = row.locLat && row.locLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${row.locLat},${row.locLng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.loc)}`;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="loc-wrap" style={{ position: 'relative' }}>
      <PlacesAutocomplete
        className="ci-ta"
        value={row.loc}
        onChange={(loc) => updateRow(index, { loc, locLat: null, locLng: null })}
        onSelect={handleSelect}
        onFocus={pushUndo}
        placeholder="Location…"
        dropdownClass="loc-ac"
      />
      {row.locLat && (
        <button
          className="loc-map-btn map-pin"
          onClick={openMap}
          title="Get directions"
          style={{ display: '' }}
        >
          &#128205;
        </button>
      )}
    </div>
  );
}
