'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useCmsLabel } from '@/lib/store/cmsStore';
import PlacesAutocomplete from './PlacesAutocomplete';
import CrewInput from './CrewInput';
import type { GeoResult } from '@/lib/googlePlaces';

interface Props {
  readOnly?: boolean;
}

export default function ScheduleHeader({ readOnly = false }: Props) {
  const meta       = useScheduleStore((s) => s.meta);
  const rows       = useScheduleStore((s) => s.rows);
  const updateMeta = useScheduleStore((s) => s.updateMeta);

  const labelTown = useCmsLabel('metaTown', 'Town / Location');
  const labelDate = useCmsLabel('metaDate', 'Date');
  const labelCall = useCmsLabel('metaCall', 'Call Time');
  const labelProd = useCmsLabel('metaProd', 'Producer');
  const labelDir  = useCmsLabel('metaDir',  'Director');
  const labelDp   = useCmsLabel('metaDp',   'Camera');

  const callTime = rows.find(r => !r.sunLocked)?.timeIn || '';

  function handleTownSelect(address: string, geo: GeoResult | null) {
    updateMeta({
      town: address,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    });
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
          <label htmlFor="m-town">{labelTown}</label>
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
              {meta.lat !== null && meta.lng !== null && (
                <button className="loc-map-btn" onClick={openTownMap} title="Open in Google Maps">
                  📍
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-date">{labelDate}</label>
          {readOnly ? (
            <div className="call-disp">{meta.date || '—'}</div>
          ) : (
            <input
              id="m-date"
              type="date"
              value={meta.date}
              onChange={(e) => updateMeta({ date: e.target.value })}
            />
          )}
        </div>
        <div className="mf">
          <label>{labelCall}</label>
          <div className="call-disp">{callTime || '—'}</div>
        </div>
        <div className="mf">
          <label htmlFor="m-prod">{labelProd}</label>
          {readOnly ? (
            <div className="call-disp">{meta.prod || '—'}</div>
          ) : (
            <CrewInput
              id="m-prod"
              field="prod"
              value={meta.prod}
              onChange={(v) => updateMeta({ prod: v })}
              placeholder="Producer name"
            />
          )}
        </div>
        <div className="mf">
          <label htmlFor="m-dir">{labelDir}</label>
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
          <label htmlFor="m-dp">{labelDp}</label>
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
