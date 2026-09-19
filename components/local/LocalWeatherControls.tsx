'use client';
import { useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useDocumentProviders } from './DocumentProvidersContext';
import WxStrip from '@/components/schedule/WxStrip';

export default function LocalWeatherControls({ enabled, scope }: { enabled: boolean; scope: string }) {
  const provider = useDocumentProviders();
  const fictional = provider?.kind !== 'live';
  const meta = useScheduleStore(s => s.meta), documentSession = useScheduleStore(s => s.documentSession);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const ticket = useRef(0), lastKey = useRef(''), lastDocument = useRef('');
  const documentKey = `${scope}|${documentSession}`;
  const key = `${scope}|${documentSession}|${meta.date}|${meta.lat}|${meta.lng}`;
  const latest = useRef({ key, enabled }); latest.current = { key, enabled };
  async function refresh() {
    if (!enabled || !provider || !meta.date || meta.lat === null || meta.lng === null) return;
    const request = ++ticket.current, expected = key;
    lastKey.current = key; setBusy(true); setMessage(fictional?'Loading fictional weather…':'Loading weather…');
    try {
      const wx = await provider.weather(meta.date, meta.lat, meta.lng, meta.town);
      if (ticket.current !== request || latest.current.key !== expected || !latest.current.enabled) return;
      if (!wx) { setMessage(fictional?'Fictional forecast unavailable. Your saved weather and schedule are retained.':'Forecast unavailable. Your saved weather and schedule are retained.'); return; }
      const state = useScheduleStore.getState(); state.pushUndo(); state.setWx(wx);
      if (wx.sunrise && wx.sunset) state.insertSunRows(wx.sunrise, wx.sunset);
      setMessage(wx.noForecast ? (fictional?'Fictional sun times loaded; no forecast available.':'Sun times loaded; forecast unavailable for this date.') : (fictional?'Fictional weather and sun times loaded.':'Weather and sun times updated.'));
    } catch { if (ticket.current === request) setMessage(fictional?'Fictional weather unavailable. Your schedule is retained.':'Weather unavailable. Your schedule is retained.'); }
    finally { if (ticket.current === request) setBusy(false); }
  }
  useEffect(() => {
    const pending = ticket;
    pending.current++; setBusy(false);
    if (!enabled || !provider) return;
    // Restore legacy sun markers from existing saved weather without fetching. Coordinate/date edits
    // fetch through the deterministic local seam, never the legacy provider.
    if (lastKey.current !== key) {
      const sameDocument = lastDocument.current === documentKey;
      lastDocument.current = documentKey; lastKey.current = key;
      if (!sameDocument && meta.wx?.sunrise && meta.wx?.sunset) {
        const state = useScheduleStore.getState();
        if (!state.rows.some(row => row.sunLocked)) {
          state.pushUndo();
          state.insertSunRows(meta.wx.sunrise, meta.wx.sunset);
        }
      } else if (!meta.wx || sameDocument) void refresh();
    }
    return () => { pending.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, provider]);
  function clear() {
    if (!enabled) return; ticket.current++; setBusy(false); lastKey.current = key;
    const state = useScheduleStore.getState(); state.pushUndo(); state.setWx(null); state.clearSunRows(); setMessage('Weather and sun rows cleared from this draft.');
  }
  return <>
    <WxStrip onRefresh={() => void refresh()} onClear={clear} readOnly={!enabled || busy} />
    <div className="local-weather-controls">
      {fictional?<span>Fictional locations and forecasts only</span>:<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather by Open-Meteo</a>}
      {!meta.wx && <button className="btn btn-light btn-sm" disabled={!enabled || busy || !meta.date || meta.lat === null || meta.lng === null} onClick={() => void refresh()}>Refresh weather</button>}
      {message && <span role="status">{message}</span>}
    </div>
  </>;
}
