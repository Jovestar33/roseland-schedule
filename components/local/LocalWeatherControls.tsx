'use client';
import { useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useDocumentProviders } from './DocumentProvidersContext';
import WxStrip from '@/components/schedule/WxStrip';
import {useToast} from '@/components/ui/ToastProvider';

export default function LocalWeatherControls({ enabled, scope }: { enabled: boolean; scope: string }) {
  const provider = useDocumentProviders();
  const {addToast}=useToast();
  const meta = useScheduleStore(s => s.meta), documentSession = useScheduleStore(s => s.documentSession);
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0), lastKey = useRef(''), lastDocument = useRef('');
  const documentKey = `${scope}|${documentSession}`;
  const key = `${scope}|${documentSession}|${meta.date}|${meta.lat}|${meta.lng}`;
  const latest = useRef({ key, enabled }); latest.current = { key, enabled };
  async function refresh() {
    if (!enabled || !provider || !meta.date || meta.lat === null || meta.lng === null) return;
    const request = ++ticket.current, expected = key;
    lastKey.current = key; setBusy(true);
    try {
      const wx = await provider.weather(meta.date, meta.lat, meta.lng, meta.town);
      if (ticket.current !== request || latest.current.key !== expected || !latest.current.enabled) return;
      if (!wx) { addToast('Weather could not be refreshed. Your schedule is unchanged.','error'); return; }
      const state = useScheduleStore.getState(); state.pushUndo(); state.setWx(wx);
      if (wx.sunrise && wx.sunset) state.insertSunRows(wx.sunrise, wx.sunset);
    } catch { if (ticket.current === request && latest.current.key === expected && latest.current.enabled) addToast('Weather could not be refreshed. Your schedule is unchanged.','error'); }
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
    const state = useScheduleStore.getState(); state.pushUndo(); state.setWx(null); state.clearSunRows();
  }
  return <>
    <WxStrip onRefresh={() => void refresh()} onClear={clear} readOnly={!enabled || busy} />
    {!meta.wx && <button className="btn btn-light btn-sm weather-empty-refresh" aria-busy={busy} disabled={!enabled || !provider || busy || !meta.date || meta.lat === null || meta.lng === null} onClick={() => void refresh()}>{busy?'Refreshing…':'Refresh weather'}</button>}
  </>;
}
