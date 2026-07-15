'use client';
import { useState, useRef, useLayoutEffect } from 'react';
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

  // Collapsible address rows — existing saved addresses start collapsed so the
  // schedule stays compact; selecting/adding an address opens the row in-session.
  const [addrOpen, setAddrOpen] = useState(false);
  const [subAddrOpen, setSubAddrOpen] = useState<Record<string, boolean>>({});

  // Display value: locName takes precedence; falls back to loc for legacy rows
  const mainNameValue = row.locName !== undefined ? row.locName : row.loc;

  function handleNameChange(v: string) {
    // Keep loc in sync for backward compat with consumers that only read loc.
    // PlacesAutocomplete calls onChange(s.main) on selection — the short place
    // name — so the name field always receives the concise label, not the address.
    updateRow(index, { locName: v, loc: v });
  }

  function handleNameSelect(addr: string, geo: GeoResult | null) {
    // Places onSelect fires AFTER onChange(s.main), so locName is already the
    // short name. Here we capture the full formatted address and coordinates,
    // and auto-open the address row so the user can see / edit it.
    updateRow(index, {
      locAddress: addr,
      locLat: geo?.lat ?? null,
      locLng: geo?.lng ?? null,
    });
    setAddrOpen(true);
  }

  function handleAddrSelect(addr: string, geo: GeoResult | null) {
    updateRow(index, {
      locAddress: addr,
      locLat: geo?.lat ?? null,
      locLng: geo?.lng ?? null,
    });
  }

  function openMainMap() {
    const url = row.locLat && row.locLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${row.locLat},${row.locLng}`
      : row.locAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.locAddress)}`
      : row.loc
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.loc)}`
      : null;
    if (url) window.open(url, '_blank', 'noopener');
  }

  const hasMainMap = !!(row.locLat && row.locLng) || !!(row.locAddress) || !!(row.loc);

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
    const url = sl.locLat && sl.locLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${sl.locLat},${sl.locLng}`
      : sl.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sl.address)}`
      : sl.loc
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sl.loc)}`
      : null;
    if (url) window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="loc-wrap">
      {/* Main location — name line (Places autocomplete fills name on select;
           onSelect captures full address + coords into the address row) */}
      <div className="loc-name-row">
        <PlacesAutocomplete
          className="ci-ta loc-name-input"
          value={mainNameValue}
          onChange={handleNameChange}
          onSelect={handleNameSelect}
          onFocus={pushUndo}
          placeholder="Location…"
          dropdownClass="loc-ac"
          multiline
        />
        <button
          type="button"
          className={`loc-addr-toggle${addrOpen ? ' open' : ''}`}
          onClick={() => setAddrOpen(v => !v)}
          aria-expanded={addrOpen}
          aria-label={addrOpen ? 'Hide full address' : 'Show full address'}
          title={addrOpen ? 'Hide address' : 'Show / add full address'}
        >
          {addrOpen ? '▾' : '▸'}
        </button>
        {hasMainMap && (
          <button type="button" className="loc-map-btn" onClick={openMainMap} title="Get directions">
            &#128205;
          </button>
        )}
      </div>

      {/* Main location — collapsible address row */}
      {addrOpen && (
        <div className="loc-addr-row">
          <PlacesAutocomplete
            className="ci-ta loc-addr-input"
            value={row.locAddress ?? ''}
            onChange={(v) => updateRow(index, { locAddress: v, locLat: null, locLng: null })}
            onSelect={handleAddrSelect}
            onFocus={pushUndo}
            placeholder="Full address…"
            dropdownClass="loc-ac"
            multiline
          />
        </div>
      )}

      {/* Sub-locations */}
      {subLocs.map((sl, i) => {
        const subNameValue = sl.name !== undefined ? sl.name : sl.loc;
        const subAddrIsOpen = !!(subAddrOpen[sl.id]);
        const hasSubMap = !!(sl.locLat && sl.locLng) || !!(sl.address) || !!(sl.loc);
        return (
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
                  className="ci-ta loc-subloc-name-input"
                  value={subNameValue}
                  onChange={(v) => patchSubLoc(i, { name: v, loc: v })}
                  onSelect={(addr, geo) => {
                    // onChange already set the short name; capture address + coords
                    // and auto-open the sub-location address row
                    patchSubLoc(i, { address: addr, locLat: geo?.lat ?? null, locLng: geo?.lng ?? null });
                    setSubAddrOpen(prev => ({ ...prev, [sl.id]: true }));
                  }}
                  onFocus={pushUndo}
                  placeholder="Sub-location…"
                  dropdownClass="loc-ac"
                  multiline
                />
              </div>
              <button
                type="button"
                className={`loc-addr-toggle${subAddrIsOpen ? ' open' : ''}`}
                onClick={() => setSubAddrOpen(prev => ({ ...prev, [sl.id]: !prev[sl.id] }))}
                aria-expanded={subAddrIsOpen}
                aria-label={subAddrIsOpen ? 'Hide full address' : 'Show full address'}
                title={subAddrIsOpen ? 'Hide address' : 'Show / add full address'}
              >
                {subAddrIsOpen ? '▾' : '▸'}
              </button>
              {hasSubMap && (
                <button type="button" className="loc-subloc-pin" onClick={() => openSubMap(sl)} title="Get directions">
                  &#128205;
                </button>
              )}
              <button type="button" className="loc-subloc-remove" onClick={() => removeSubLoc(i)} title="Remove sub-location">
                &#215;
              </button>
            </div>
            {subAddrIsOpen && (
              <div className="loc-addr-row loc-subloc-addr-row">
                <PlacesAutocomplete
                  className="ci-ta loc-addr-input"
                  value={sl.address ?? ''}
                  onChange={(v) => patchSubLoc(i, { address: v, locLat: null, locLng: null })}
                  onSelect={(addr, geo) => patchSubLoc(i, {
                    address: addr,
                    locLat: geo?.lat ?? null,
                    locLng: geo?.lng ?? null,
                  })}
                  onFocus={pushUndo}
                  placeholder="Full address…"
                  dropdownClass="loc-ac"
                  multiline
                />
              </div>
            )}
            <div className="loc-subloc-desc-wrap">
              <DescTextarea
                value={sl.desc ?? ''}
                onChange={(desc) => patchSubLoc(i, { desc })}
                onFocus={pushUndo}
              />
            </div>
          </div>
        );
      })}

      <button type="button" className="loc-add-subloc" onClick={addSubLoc}>
        + sub-location
      </button>
    </div>
  );
}
