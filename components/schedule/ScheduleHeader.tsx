'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import PlacesAutocomplete from './PlacesAutocomplete';
import CrewInput from './CrewInput';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  onWeatherNeeded?: (date: string, lat: number, lng: number, town: string) => void;
  readOnly?: boolean;
}

export default function ScheduleHeader({ onWeatherNeeded, readOnly = false }: Props) {
  const meta       = useScheduleStore((s) => s.meta);
  const rows       = useScheduleStore((s) => s.rows);
  const updateMeta = useScheduleStore((s) => s.updateMeta);

  const callTime = rows[0]?.timeIn || '';

  function handleTownSelect(address: string, geo: GeoResult | null) {
    const patch = {
      town: address,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    };
    updateMeta(patch);
    if (geo && meta.date && onWeatherNeeded) {
      onWeatherNeeded(meta.date, geo.lat, geo.lng, address);
    }
  }

  function handleDateChange(date: string) {
    updateMeta({ date });
    if (date && meta.lat && meta.lng && onWeatherNeeded) {
      onWeatherNeeded(date, meta.lat, meta.lng, meta.town);
    }
  }

  function openTownMap() {
    const url = meta.lat && meta.lng
      ? `https://www.google.com/maps/search/?api=1&query=${meta.lat},${meta.lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(meta.town)}`;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="meta">
      <div className="meta-grid">
        <div className="mf">
          <label htmlFor="m-town">Town / Location</label>
          {readOnly ? (
            <div className="call-disp">{meta.town || '—'}</div>
          ) : (
            <div className="ac-wrap">
              <PlacesAutocomplete
                id="m-town"
                value={meta.town}
                onChange={(v) => updateMeta({ town: v })}
                onSelect={handleTownSelect}
                placeholder="e.g. Garner, NC"
              />
              {meta.town && (
                <button className="map-pin" onClick={openTownMap} title="Open in Google Maps">
                  📍
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-date">Date</label>
          {readOnly ? (
            <div className="call-disp">{meta.date || '—'}</div>
          ) : (
            <input
              id="m-date"
              type="date"
              value={meta.date}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          )}
        </div>
        <div className="mf">
          <label>Call Time</label>
          <div className="call-disp">{callTime || '—'}</div>
        </div>
        <div className="mf">
          <label htmlFor="m-prod">Production</label>
          {readOnly ? (
            <div className="call-disp">{meta.prod || '—'}</div>
          ) : (
            <CrewInput
              id="m-prod"
              field="prod"
              value={meta.prod}
              onChange={(v) => updateMeta({ prod: v })}
              placeholder="Film / Show title"
            />
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-dir">Director</label>
          {readOnly ? (
            <div className="call-disp">{meta.dir || '—'}</div>
          ) : (
            <CrewInput
              id="m-dir"
              field="dir"
              value={meta.dir}
              onChange={(v) => updateMeta({ dir: v })}
              placeholder="Director name"
            />
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-dp">DP</label>
          {readOnly ? (
            <div className="call-disp">{meta.dp || '—'}</div>
          ) : (
            <CrewInput
              id="m-dp"
              field="dp"
              value={meta.dp}
              onChange={(v) => updateMeta({ dp: v })}
              placeholder="DP name"
            />
          )}
        </div>
      </div>
    </div>
  );
}
