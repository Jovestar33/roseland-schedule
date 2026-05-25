'use client';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { SubLocation } from '@/lib/types';
import PlacesAutocomplete from './PlacesAutocomplete';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  rowIndex: number;
  onClose: () => void;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function openInMaps(lat: number | null, lng: number | null, fallback?: string) {
  const url = lat !== null && lng !== null
    ? mapsUrl(lat, lng)
    : fallback ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallback)}` : null;
  if (url) window.open(url, '_blank', 'noopener');
}

export default function LocationDetailsModal({ rowIndex, onClose }: Props) {
  const row       = useScheduleStore((s) => s.rows[rowIndex]);
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushUndo  = useScheduleStore((s) => s.pushUndo);

  // Sub-location edits are buffered locally — written to the row only on Done.
  const [subLocs,     setSubLocs]     = useState<SubLocation[]>(() =>
    row?.locationDetails ? [...row.locationDetails] : []
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mounted,     setMounted]     = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Escape key discards changes and closes
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted || !row) return null;

  // ── Sub-location helpers ─────────────────────────────────────────────────

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addSubLocation() {
    const id = newId();
    const blank: SubLocation = { id, name: '', address: '', lat: null, lng: null, mapsUrl: '', notes: '' };
    setSubLocs((prev) => [...prev, blank]);
    setExpandedIds((prev) => new Set([...prev, id]));
  }

  function removeSubLocation(id: string) {
    setSubLocs((prev) => prev.filter((sl) => sl.id !== id));
    setExpandedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function patchSubLoc(id: string, patch: Partial<SubLocation>) {
    setSubLocs((prev) => prev.map((sl) => sl.id === id ? { ...sl, ...patch } : sl));
  }

  function handleSubLocSelect(id: string, address: string, geo: GeoResult | null) {
    const url = geo ? mapsUrl(geo.lat, geo.lng) : '';
    patchSubLoc(id, {
      address: geo?.address || address,
      lat:     geo?.lat ?? null,
      lng:     geo?.lng ?? null,
      mapsUrl: url,
    });
  }

  // ── Main location (live — mirrors the inline LocationCell) ───────────────

  function handleMainLocSelect(address: string, geo: GeoResult | null) {
    updateRow(rowIndex, {
      loc:    address,
      locLat: geo?.lat ?? null,
      locLng: geo?.lng ?? null,
    });
  }

  // ── Confirm ──────────────────────────────────────────────────────────────

  function handleDone() {
    const cleaned = subLocs.filter((sl) => sl.name.trim() || sl.address.trim());
    updateRow(rowIndex, { locationDetails: cleaned.length > 0 ? cleaned : undefined });
    onClose();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const content = (
    <div
      className="ldm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ldm-panel">
        <h2 className="ldm-title">Location Details</h2>

        {/* ── Main location ── */}
        <div className="ldm-section">
          <div className="ldm-section-label">Main Location</div>
          <PlacesAutocomplete
            className="ldm-main-input"
            value={row.loc}
            onChange={(loc) => updateRow(rowIndex, { loc, locLat: null, locLng: null })}
            onSelect={handleMainLocSelect}
            onFocus={pushUndo}
            placeholder="Location…"
            multiline
          />
          {(row.locLat !== null || row.loc) && (
            <button
              className="ldm-map-btn"
              onClick={() => openInMaps(row.locLat, row.locLng, row.loc)}
            >
              &#128205; Open in Maps
            </button>
          )}
        </div>

        {/* ── Sub-locations ── */}
        <div className="ldm-section">
          <div className="ldm-section-label">Sub-locations</div>

          {subLocs.length > 0 && (
            <div className="ldm-subloc-list">
              {subLocs.map((sl) => {
                const expanded = expandedIds.has(sl.id);
                return (
                  <div key={sl.id} className="ldm-subloc-row">

                    {/* Collapsed header row */}
                    <div
                      className="ldm-subloc-header"
                      onClick={() => toggleExpanded(sl.id)}
                    >
                      <span className="ldm-subloc-chevron">{expanded ? '▾' : '▸'}</span>
                      <span className={`ldm-subloc-name-preview${!sl.name.trim() ? ' ldm-subloc-name-preview--empty' : ''}`}>
                        {sl.name.trim() || 'Unnamed sub-location'}
                      </span>
                      {sl.lat !== null && sl.lng !== null && (
                        <button
                          className="ldm-subloc-pin-btn"
                          title="Open in Maps"
                          onClick={(e) => { e.stopPropagation(); openInMaps(sl.lat, sl.lng); }}
                        >
                          &#128205;
                        </button>
                      )}
                    </div>

                    {/* Expanded body */}
                    {expanded && (
                      <div className="ldm-subloc-body">
                        <div>
                          <div className="ldm-field-label">Name</div>
                          <input
                            className="ldm-input"
                            type="text"
                            placeholder="Sub-location name…"
                            value={sl.name}
                            autoFocus
                            onChange={(e) => patchSubLoc(sl.id, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <div className="ldm-field-label">Address</div>
                          <PlacesAutocomplete
                            className="ldm-input"
                            value={sl.address}
                            onChange={(address) => patchSubLoc(sl.id, { address, lat: null, lng: null, mapsUrl: '' })}
                            onSelect={(address, geo) => handleSubLocSelect(sl.id, address, geo)}
                            placeholder="Search for address…"
                          />
                        </div>
                        {sl.address && (
                          <div className="ldm-address-display">{sl.address}</div>
                        )}
                        {sl.lat !== null && sl.lng !== null && (
                          <div className="ldm-latlng-display">
                            {sl.lat.toFixed(5)}, {sl.lng.toFixed(5)}
                          </div>
                        )}
                        <div>
                          <div className="ldm-field-label">Notes</div>
                          <textarea
                            className="ldm-textarea"
                            placeholder="Notes…"
                            value={sl.notes}
                            onChange={(e) => patchSubLoc(sl.id, { notes: e.target.value })}
                          />
                        </div>
                        <div className="ldm-subloc-footer">
                          {sl.lat !== null && sl.lng !== null ? (
                            <button
                              className="ldm-map-btn"
                              onClick={() => openInMaps(sl.lat, sl.lng)}
                            >
                              &#128205; Open in Maps
                            </button>
                          ) : <span />}
                          <button
                            className="ldm-remove-btn"
                            onClick={() => removeSubLocation(sl.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button className="ldm-add-subloc-btn" onClick={addSubLocation}>
            + Add Sub-location
          </button>
        </div>

        {/* ── Actions ── */}
        <div className="ldm-actions">
          <button className="btn btn-light btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink btn-sm" onClick={handleDone}>Done</button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
