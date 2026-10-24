'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsLabel } from '@/lib/store/cmsStore';
import PlacesAutocomplete from './PlacesAutocomplete';
import {useDocumentProviders} from '@/components/local/DocumentProvidersContext';
import { useLocalEditor } from './LocalEditorContext';
import CrewIdentityBlock from './CrewIdentityBlock';
import HeaderIdentityLine from './HeaderIdentityLine';
import {displayTimeIn} from '@/lib/time';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  readOnly?: boolean;
}

export default function ScheduleHeader({ readOnly = false }: Props) {
  const local = useLocalEditor();
  const providers = useDocumentProviders();
  const linksEnabled = !local || providers?.kind === 'live';
  const meta       = useScheduleStore((s) => s.meta);
  const rows       = useScheduleStore((s) => s.rows);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const pushUndo = useScheduleStore((s) => s.pushUndo);

  const labelTown = useCmsLabel('metaTown', 'Town / Location');
  const labelDate = useCmsLabel('metaDate', 'Date');
  const labelCall = useCmsLabel('metaCall', 'Call Time');

  const selectedDate = meta.date ? new Date(`${meta.date}T00:00:00Z`) : null;
  const weekday = selectedDate && !Number.isNaN(selectedDate.getTime())
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    : '';

  const firstTimedRow=rows.find(r=>!r.sunLocked&&r.timeIn);
  const callTime = firstTimedRow?displayTimeIn(firstTimedRow):'';

  function handleTownSelect(address: string, geo: GeoResult | null) {
    updateMeta({
      town: address,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    });
  }

  function openTownMap() {
    if (!linksEnabled) return;
    const url = meta.lat !== null && meta.lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${meta.lat},${meta.lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(meta.town)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="meta">
      <HeaderIdentityLine readOnly={readOnly} />
      <CrewIdentityBlock readOnly={readOnly} />
      <div className="meta-grid">
        <div className="mf">
          <label htmlFor="m-town">{labelTown}</label>
          {readOnly ? (
            <div className="call-disp">{meta.town || '—'}</div>
          ) : (
            <div className="ac-wrap">
              <PlacesAutocomplete
                id="m-town"
                value={meta.town}
                onChange={(v) => updateMeta({ town: v, lat: null, lng: null })}
                onSelect={handleTownSelect}
                onFocus={pushUndo}
                placeholder="e.g. Garner, NC"
              />
              {linksEnabled && meta.lat !== null && meta.lng !== null && (
                <button className="loc-map-btn" onClick={openTownMap} title="Open in Google Maps">
                  📍
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-date">{labelDate}</label>
          <div className="date-value-line">
            {readOnly ? (
              <div className="call-disp">{meta.date || '—'}</div>
            ) : (
              <div className="date-field-wrap">
                <input
                  id="m-date"
                  type="date"
                  autoComplete="off"
                  value={meta.date}
                  onFocus={pushUndo}
                  onChange={(e) => updateMeta({ date: e.target.value })}
                  className={meta.date ? '' : 'date-unset'}
                />
                {!meta.date && <span className="date-placeholder">— pick a date —</span>}
              </div>
            )}
            {weekday && <span className="date-weekday">{weekday}</span>}
          </div>
        </div>
        <div className="mf">
          <label>{labelCall}</label>
          <div className="call-disp">{callTime || '—'}</div>
        </div>
      </div>
    </div>
  );
}
