'use client';
import { useDocumentRequest } from './useDocumentRequest';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';
import { useScheduleStore } from '../store/scheduleStore';
import { postSave, type SaveError } from '../api/save';
import { postLoad } from '../api/load';
import { postAddSnapshot } from '../api/snapshots';
import { normalizeRows } from '../rowNormalizer';
import type { ConflictState } from '../types';

export function useSaveActions(routeName: string) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const scheduleName      = useScheduleStore((s) => s.scheduleName);
  const getScheduleData   = useScheduleStore((s) => s.getScheduleData);
  const markClean         = useScheduleStore((s) => s.markClean);
  const loadSchedule      = useScheduleStore((s) => s.loadSchedule);
  const newSchedule       = useScheduleStore((s) => s.newSchedule);
  const setSyncStatus     = useScheduleStore((s) => s.setSyncStatus);
  const setRemoteBaseline = useScheduleStore((s) => s.setRemoteBaseline);
  const setConflictData   = useScheduleStore((s) => s.setConflictData);

  const { beginRequest, isCurrent, invalidate } = useDocumentRequest(routeName);

  function updateBaseline(savedAt: number) {
    // Zustand updates synchronously. Read the store again for each request.
    setRemoteBaseline(savedAt, '');
  }

  function acknowledgeSave(request: ReturnType<typeof beginRequest>, savedAt: number) {
    if (!isCurrent(request)) return;
    const unchanged = request.revision === useScheduleStore.getState().editRevision;
    if (unchanged) markClean();
    updateBaseline(savedAt);
    setSyncStatus(unchanged ? 'synced' : 'pending');
    setConflictData(null);
  }

  async function loadScheduleFromCloud(name: string) {
    // If the store already has this schedule with a remote baseline (e.g. navigation triggered
    // immediately after saveAs), skip the fetch — the data is already current.
    const current = useScheduleStore.getState();
    if (current.scheduleName === name && current.remoteBaseline !== null) return;
    // Immediately clear to blank so the UI never flashes the previous schedule's data.
    // If the server has real data for this name, loadSchedule() will replace the blank state.
    newSchedule(name);
    const request = beginRequest();
    if (!token) return;
    setSyncStatus('syncing');
    try {
      const data = await postLoad(name, token);
      if (!isCurrent(request)) return;
      if (request.revision !== useScheduleStore.getState().editRevision) {
        setSyncStatus('pending');
        return;
      }
      if (data) {
        const normalized = { ...data, rows: normalizeRows(data.rows) };
        loadSchedule(name, normalized);
        updateBaseline(normalized.savedAt ?? 0);
      }
      setSyncStatus('synced');
    } catch {
      if (isCurrent(request)) setSyncStatus('offline');
    }
  }

  async function saveCurrent(force = false) {
    const current = useScheduleStore.getState();
    const name = current.scheduleName;
    if (!name) return;
    if (!token) { router.push('/login'); return; }
    const request = beginRequest();
    const data = current.getScheduleData();
    setSyncStatus('syncing');
    try {
      const result = await postSave(name, data, token, {
        force,
        expectedSavedAt: current.remoteBaseline?.savedAt ?? 0,
      });
      acknowledgeSave(request, result.savedAt);
    } catch (e) {
      if (!isCurrent(request)) return;
      const err = e as SaveError;
      if (err.conflict) {
        setSyncStatus('conflict');
        setConflictData({
          local: useScheduleStore.getState().getScheduleData(),
          remote: err.remoteData ?? data,
          scheduleName: name,
        } satisfies ConflictState);
      } else {
        setSyncStatus('offline');
      }
    }
  }

  async function save() { await saveCurrent(); }
  async function saveForce() { await saveCurrent(true); }

  async function saveAs(newName: string) {
    if (!token) { router.push('/login'); return; }
    const request = beginRequest();
    setSyncStatus('syncing');
    const data = getScheduleData();
    try {
      const result = await postSave(newName, data, token, { createOnly: true });
      if (!isCurrent(request)) return;
      const changed = request.revision !== useScheduleStore.getState().editRevision;
      // Keep edits made during Save As in the new document, still unsaved.
      useScheduleStore.setState({ scheduleName: newName, dirty: changed });
      updateBaseline(result.savedAt);
      setSyncStatus(changed ? 'pending' : 'synced');
      setConflictData(null);
      // Tell the Library that this name was just saved so a stale list read
      // during the Blob propagation window doesn't hide the new schedule.
      try {
        sessionStorage.setItem('rp_recently_added_schedule', JSON.stringify({ name: newName, addedAt: Date.now() }));
        // Also cache the schedule meta so the Library can group the new schedule
        // correctly even when postLoad returns 404 due to a stale CDN edge read
        // (the blob list finds the key, but the get for the new key misses the CDN).
        sessionStorage.setItem('rp_recently_saved_meta', JSON.stringify({
          name: newName,
          meta: data.meta,
          savedAt: result.savedAt,
          addedAt: Date.now(),
        }));
        console.log('[SaveAs] cached meta for Library grouping:', newName,
          '— projectName:', data.meta?.projectName, '/ phase:', data.meta?.phase);
      } catch {}
      router.push(`/schedule/${encodeURIComponent(newName)}`);
    } catch (error) {
      if (!isCurrent(request)) return;
      const state = useScheduleStore.getState();
      setSyncStatus((error as SaveError).nameExists ? (state.dirty ? 'pending' : 'synced') : 'offline');
      throw error;
    }
  }

  async function takeSnapshot(label = 'Manual snapshot'): Promise<boolean> {
    if (!scheduleName || !token) return false;
    const data = getScheduleData();
    try {
      await postAddSnapshot(scheduleName, data, label, token);
      return true;
    } catch {
      return false;
    }
  }

  async function resolveConflictOverwrite(conflictState: ConflictState) {
    if (!token || useScheduleStore.getState().scheduleName !== conflictState.scheduleName) return;
    const request = beginRequest();
    // Snapshot the remote version first so it's not lost
    try {
      await postAddSnapshot(
        conflictState.scheduleName,
        conflictState.remote,
        'Remote version before overwrite',
        token
      );
    } catch { /* best-effort */ }
    if (isCurrent(request)) await saveForce();
  }

  async function resolveConflictReload(conflictState: ConflictState) {
    if (!token || useScheduleStore.getState().scheduleName !== conflictState.scheduleName) return;
    const request = beginRequest();
    // Snapshot the local version first
    try {
      await postAddSnapshot(
        conflictState.scheduleName,
        conflictState.local,
        'Before remote reload',
        token
      );
    } catch { /* best-effort */ }
    if (!isCurrent(request) || request.revision !== useScheduleStore.getState().editRevision) return;
    const remote = conflictState.remote;
    loadSchedule(conflictState.scheduleName, remote);
    updateBaseline(remote.savedAt ?? 0);
    setSyncStatus('synced');
    setConflictData(null);
  }

  function closeSchedule() {
    if (useScheduleStore.getState().dirty) {
      if (!confirm('Close this schedule? Unsaved changes will be lost.')) return;
    }
    // Bust the Next.js router cache so LibraryPage remounts and re-fetches
    // rather than being reactivated from the stale client-side cache.
    invalidate();
    router.refresh();
    router.push('/');
  }

  return {
    loadScheduleFromCloud,
    save,
    saveAs,
    saveForce,
    takeSnapshot,
    resolveConflictOverwrite,
    resolveConflictReload,
    closeSchedule,
  };
}
