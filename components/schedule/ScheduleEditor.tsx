'use client';
import { useState, useEffect, useRef } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useAuthStore } from '@/lib/store/authStore';
import { useSaveActions } from '@/lib/hooks/useSaveActions';
import { fetchWeather } from '@/lib/weather';
import { AUTO_SNAPSHOT_INTERVAL_MS } from '@/lib/constants';
import type { ScheduleRow } from '@/lib/types';
import ScheduleHeader from './ScheduleHeader';
import ScheduleGrid from './ScheduleGrid';
import WxStrip from './WxStrip';
import EditorToolbar from '@/components/toolbar/EditorToolbar';
import ContactModal from '@/components/modals/ContactModal';
import StatusModal from '@/components/modals/StatusModal';
import NotesModal from '@/components/modals/NotesModal';
import SaveAsModal from '@/components/modals/SaveAsModal';
import ConflictModal from '@/components/modals/ConflictModal';
import { useToast } from '@/components/ui/ToastProvider';

interface Props {
  name: string;
}

export default function ScheduleEditor({ name }: Props) {
  const scheduleName    = useScheduleStore((s) => s.scheduleName);
  const rows            = useScheduleStore((s) => s.rows);
  const meta            = useScheduleStore((s) => s.meta);
  const dirty           = useScheduleStore((s) => s.dirty);
  const conflictData    = useScheduleStore((s) => s.conflictData);
  const setConflictData = useScheduleStore((s) => s.setConflictData);
  const updateRow       = useScheduleStore((s) => s.updateRow);
  const addRowAfter     = useScheduleStore((s) => s.addRowAfter);
  const pushUndo        = useScheduleStore((s) => s.pushUndo);
  const insertSunRows   = useScheduleStore((s) => s.insertSunRows);
  const clearSunRows    = useScheduleStore((s) => s.clearSunRows);
  const setWx           = useScheduleStore((s) => s.setWx);

  const hydrated = useAuthStore((s) => s.hydrated);

  const {
    loadScheduleFromCloud,
    save,
    saveAs,
    takeSnapshot,
    resolveConflictOverwrite,
    resolveConflictReload,
    closeSchedule,
  } = useSaveActions();

  const { addToast } = useToast();

  const [contactRow, setContactRow] = useState<number | null>(null);
  const [statusRow,  setStatusRow]  = useState<number | null>(null);
  const [notesRow,   setNotesRow]   = useState<number | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  const loadedName   = useRef<string | null>(null);
  const loaderRef    = useRef(loadScheduleFromCloud);
  loaderRef.current  = loadScheduleFromCloud;

  // Auto-snapshot every 5 minutes when schedule is dirty.
  useEffect(() => {
    if (!scheduleName) return;
    const timer = setInterval(() => {
      if (dirty) takeSnapshot('Auto snapshot');
    }, AUTO_SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleName]);

  useEffect(() => {
    if (!hydrated) return;
    if (loadedName.current === name) return;
    loadedName.current = name;
    loaderRef.current(name);
  }, [name, hydrated]);

  // Weather — key of the date+lat+lng that was active when the schedule last loaded
  const loadedWxKey = useRef('');
  const wxFetchKey  = useRef('');

  // When a schedule loads: restore sun rows from saved wx, or fetch fresh if no saved wx
  useEffect(() => {
    const key = `${meta.date}|${meta.lat}|${meta.lng}`;
    loadedWxKey.current = key;

    if (meta.wx?.sunrise && meta.wx?.sunset) {
      const hasSunRows = rows.some(r => r.sunLocked);
      if (!hasSunRows) insertSunRows(meta.wx.sunrise, meta.wx.sunset);
      return;
    }
    if (meta.date && meta.lat && meta.lng) {
      wxFetchKey.current = '';
      doFetchWeather(meta.date, meta.lat, meta.lng, meta.town);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleName]);

  // When user changes date or location during a session, auto-fetch weather
  useEffect(() => {
    if (!meta.date || !meta.lat || !meta.lng) return;
    const key = `${meta.date}|${meta.lat}|${meta.lng}`;
    if (key === loadedWxKey.current) return; // same values as when schedule loaded
    doFetchWeather(meta.date, meta.lat, meta.lng, meta.town);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.date, meta.lat, meta.lng]);

  async function doFetchWeather(date: string, lat: number, lng: number, town: string) {
    const key = `${date}|${lat}|${lng}`;
    if (wxFetchKey.current === key) return;
    wxFetchKey.current = key;
    const wx = await fetchWeather(date, lat, lng, town);
    if (!wx) return;
    setWx(wx);
    if (wx.sunrise && wx.sunset) insertSunRows(wx.sunrise, wx.sunset);
  }

  async function handleRefreshWeather() {
    if (!meta.lat || !meta.lng || !meta.date) return;
    wxFetchKey.current = '';
    const wx = await fetchWeather(meta.date, meta.lat, meta.lng, meta.town);
    if (!wx) return;
    setWx(wx);
    if (wx.sunrise && wx.sunset) insertSunRows(wx.sunrise, wx.sunset);
  }

  function handleClearWeather() {
    setWx(null);
    clearSunRows();
    wxFetchKey.current = '';
  }

  // Bug 4: Redirect "Save" to SaveAs with smart default when the schedule is still Untitled.
  function handleSave() {
    if (scheduleName === 'Untitled') {
      setSaveAsOpen(true);
    } else {
      save();
    }
  }

  // Bug 3: Snapshot button passes a click Event as the label argument; wrap to ignore it.
  async function handleSnapshot() {
    await takeSnapshot();
    addToast('Snapshot saved', 'success');
  }

  function getSaveAsDefault(): string {
    if (meta.town) {
      const town = meta.town.split(',')[0].trim();
      if (meta.date) {
        const d = new Date(meta.date + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        });
        return `${town} – ${d}`;
      }
      return town;
    }
    return scheduleName ?? '';
  }

  return (
    <div className="panel">
      <EditorToolbar
        onSave={handleSave}
        onOpenSaveAs={() => setSaveAsOpen(true)}
        onSnapshot={handleSnapshot}
        onClose={closeSchedule}
      />
      <WxStrip onRefresh={handleRefreshWeather} onClear={handleClearWeather} />
      <ScheduleHeader />
      <ScheduleGrid
        onOpenContact={(i) => setContactRow(i)}
        onOpenStatus={(i)  => setStatusRow(i)}
        onOpenNotes={(i)   => setNotesRow(i)}
      />
      <div className="add-area">
        <button className="btn btn-light" onClick={() => { pushUndo(); addRowAfter(rows.length - 1); }}>
          + Add Row
        </button>
      </div>

      <SaveAsModal
        open={saveAsOpen}
        defaultName={getSaveAsDefault()}
        onSave={saveAs}
        onClose={() => setSaveAsOpen(false)}
      />
      <ConflictModal
        open={conflictData !== null}
        conflictData={conflictData}
        onOverwrite={() => { if (conflictData) resolveConflictOverwrite(conflictData); }}
        onSaveAs={() => { setConflictData(null); setSaveAsOpen(true); }}
        onReload={() => { if (conflictData) resolveConflictReload(conflictData); }}
        onClose={() => setConflictData(null)}
      />
      <ContactModal
        open={contactRow !== null}
        row={contactRow !== null ? rows[contactRow] : null}
        onSave={(patch) => { if (contactRow !== null) { pushUndo(); updateRow(contactRow, patch as Partial<ScheduleRow>); } }}
        onClose={() => setContactRow(null)}
      />
      <StatusModal
        open={statusRow !== null}
        row={statusRow !== null ? rows[statusRow] : null}
        onSave={(status) => { if (statusRow !== null) { pushUndo(); updateRow(statusRow, { status }); } }}
        onClear={() => { if (statusRow !== null) { pushUndo(); updateRow(statusRow, { status: '' }); } }}
        onClose={() => setStatusRow(null)}
      />
      <NotesModal
        open={notesRow !== null}
        notes={notesRow !== null ? rows[notesRow]?.notes ?? '' : ''}
        onSave={(notes) => { if (notesRow !== null) { pushUndo(); updateRow(notesRow, { notes }); } }}
        onClose={() => setNotesRow(null)}
      />
    </div>
  );
}
