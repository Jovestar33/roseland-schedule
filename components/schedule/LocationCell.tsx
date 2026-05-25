'use client';
import { useRef, useLayoutEffect } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow, SubLocation } from '@/lib/types';
import PlacesAutocomplete from './PlacesAutocomplete';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  index: number;
  row: ScheduleRow;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function DescTextarea({ value, onChange, onFocus }: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="loc-subloc-desc"
      value={value}
      placeholder="Description…"
      rows={1}
      style={{ resize: 'none', overflow: 'hidden' }}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
    />
  );
}

export default function LocationCell({ index, row }: Props) {
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  const subLocs = row.subLocations ?? [];

  function handleMainSelect(address: string, geo: GeoResult | null) {
    updateRow(index, {
      loc:    address,
      locLat: geo?.lat ?? null,
      locLng: geo?.lng ?? null,
    });
  }

  function openMainMap() {
    const url = row.locLat && row.locLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${row.locLat},${row.locLng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.loc)}`;
    window.open(url, '_blank', 'noopener');
  }

  function patchSubLoc(i: number, patch: Partial<SubLocation>) {
    const next = subLocs.map((sl, j) => j === i ? { ...sl, ...patch } : sl);
    updateRow(index, { subLocations: next });
  }

  function addSubLoc() {
    pushUndo();
    updateRow(index, {
      subLocations: [...subLocs, { id: newId(), loc: '', locLat: null, locLng: null }],
    });
  }

  function removeSubLoc(i: number) {
    pushUndo();
    const next = subLocs.filter((_, j) => j !== i);
    updateRow(index, { subLocations: next.length > 0 ? next : undefined });
  }

  function openSubMap(sl: SubLocation) {
    if (sl.locLat && sl.locLng) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${sl.locLat},${sl.locLng}`,
        '_blank', 'noopener'
      );
    }
  }

  return (
    <div className="loc-wrap">
      {/* Main location */}
      <div className="loc-main-row">
        <PlacesAutocomplete
          className="ci-ta"
          value={row.loc}
          onChange={(loc) => updateRow(index, { loc, locLat: null, locLng: null })}
          onSelect={handleMainSelect}
          onFocus={pushUndo}
          placeholder="Location…"
          dropdownClass="loc-ac"
          multiline
        />
        {row.locLat && (
          <button type="button" className="loc-map-btn" onClick={openMainMap} title="Get directions">
            &#128205;
          </button>
        )}
      </div>

      {/* Sub-locations */}
      {subLocs.map((sl, i) => (
        <div key={sl.id} className="loc-subloc-row">
          <div className="loc-subloc-main">
            <input
              type="checkbox"
              className="loc-subloc-cb"
              checked={sl.done ?? false}
              onChange={(e) => patchSubLoc(i, { done: e.target.checked })}
              title="Mark done"
            />
            <span className="loc-subloc-bullet">•</span>
            <div className="loc-subloc-input-wrap">
              <PlacesAutocomplete
                className="ci-ta loc-subloc-ta"
                value={sl.loc}
                onChange={(loc) => patchSubLoc(i, { loc, locLat: null, locLng: null })}
                onSelect={(loc, geo) => patchSubLoc(i, { loc, locLat: geo?.lat ?? null, locLng: geo?.lng ?? null })}
                onFocus={pushUndo}
                placeholder="Sub-location…"
                dropdownClass="loc-ac"
                multiline
              />
            </div>
            {sl.locLat && (
              <button type="button" className="loc-subloc-pin" onClick={() => openSubMap(sl)} title="Get directions">
                &#128205;
              </button>
            )}
            <button type="button" className="loc-subloc-remove" onClick={() => removeSubLoc(i)} title="Remove sub-location">
              &#215;
            </button>
          </div>
          <div className="loc-subloc-desc-wrap">
            <DescTextarea
              value={sl.desc ?? ''}
              onChange={(desc) => patchSubLoc(i, { desc })}
              onFocus={pushUndo}
            />
          </div>
        </div>
      ))}

      <button type="button" className="loc-add-subloc" onClick={addSubLoc}>
        + sub-location
      </button>
    </div>
  );
}
