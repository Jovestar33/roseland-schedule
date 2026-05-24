'use client';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';
import { useScheduleStore } from '../store/scheduleStore';
import { postSave, type SaveError } from '../api/save';
import { postLoad } from '../api/load';
import { postAddSnapshot } from '../api/snapshots';
import { normalizeRows } from '../rowNormalizer';
import type { ConflictState } from '../types';

export function useSaveActions() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const scheduleName      = useScheduleStore((s) => s.scheduleName);
  const dirty             = useScheduleStore((s) => s.dirty);
  const getScheduleData   = useScheduleStore((s) => s.getScheduleData);
  const markClean         = useScheduleStore((s) => s.markClean);
  const loadSchedule      = useScheduleStore((s) => s.loadSchedule);
  const newSchedule       = useScheduleStore((s) => s.newSchedule);
  const setSyncStatus     = useScheduleStore((s) => s.setSyncStatus);
  const remoteBaseline    = useScheduleStore((s) => s.remoteBaseline);
  const setRemoteBaseline = useScheduleStore((s) => s.setRemoteBaseline);
  const setConflictData   = useScheduleStore((s) => s.setConflictData);

  // Mutable ref that stays current every render AND is updated synchronously
  // right after each save response — before React's re-render cycle runs.
  // This prevents stale closures from reading the pre-save baseline on the
  // very next save attempt (the alternating-conflict bug).
  const remoteBaselineRef = useRef(remoteBaseline);
  remoteBaselineRef.current = remoteBaseline;

  function updateBaseline(savedAt: number) {
    remoteBaselineRef.current = { savedAt, hash: '' };  // synchronous — visible in the same JS tick
    setRemoteBaseline(savedAt, '');                      // async via Zustand/React (for store subscribers)
  }

  async function loadScheduleFromCloud(name: string) {
    // If the store already has this schedule with a remote baseline (e.g. navigation triggered
    // immediately after saveAs), skip the fetch — the data is already current.
    if (scheduleName === name && remoteBaselineRef.current !== null) return;
    // Immediately clear to blank so the UI never flashes the previous schedule's data.
    // If the server has real data for this name, loadSchedule() will replace the blank state.
    newSchedule(name);
    if (!token) return;
    setSyncStatus('syncing');
    try {
      const data = await postLoad(name, token);
      if (data) {
        const normalized = { ...data, rows: normalizeRows(data.rows) };
        loadSchedule(name, normalized);
        updateBaseline(normalized.savedAt ?? 0);
      }
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  async function save() {
    if (!scheduleName) return;
    if (!token) { router.push('/login'); return; }
    setSyncStatus('syncing');
    const data = getScheduleData();
    // Read from the ref — always the latest value regardless of render cycle.
    const baseline = remoteBaselineRef.current;
    try {
      const result = await postSave(scheduleName, data, token, {
        expectedSavedAt: baseline?.savedAt ?? 0,
      });
      markClean();
      updateBaseline(result.savedAt);
      setSyncStatus('synced');
    } catch (e) {
      const err = e as SaveError;
      if (err.conflict) {
        setSyncStatus('conflict');
        setConflictData({
          local: data,
          remote: err.remoteData ?? data,
          scheduleName: scheduleName,
        } satisfies ConflictState);
      } else {
        setSyncStatus('offline');
      }
    }
  }

  async function saveForce() {
    if (!scheduleName || !token) return;
    setSyncStatus('syncing');
    const data = getScheduleData();
    try {
      const result = await postSave(scheduleName, data, token, { force: true });
      markClean();
      updateBaseline(result.savedAt);
      setSyncStatus('synced');
      setConflictData(null);
    } catch {
      setSyncStatus('offline');
    }
  }

  async function saveAs(newName: string) {
    if (!token) { router.push('/login'); return; }
    setSyncStatus('syncing');
    const data = getScheduleData();
    try {
      const result = await postSave(newName, data, token, {});
      const savedData = { ...data, savedAt: result.savedAt };
      loadSchedule(newName, savedData);
      updateBaseline(result.savedAt);
      setSyncStatus('synced');
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
    } catch {
      setSyncStatus('offline');
    }
  }

  async function takeSnapshot(label = 'Manual snapshot') {
    if (!scheduleName || !token) return;
    const data = getScheduleData();
    try {
      await postAddSnapshot(scheduleName, data, label, token);
    } catch {
      // best-effort
    }
  }

  async function resolveConflictOverwrite(conflictState: ConflictState) {
    if (!token) return;
    // Snapshot the remote version first so it's not lost
    try {
      await postAddSnapshot(
        conflictState.scheduleName,
        conflictState.remote,
        'Remote version before overwrite',
        token
      );
    } catch { /* best-effort */ }
    await saveForce();
  }

  async function resolveConflictReload(conflictState: ConflictState) {
    if (!token) return;
    // Snapshot the local version first
    try {
      await postAddSnapshot(
        conflictState.scheduleName,
        conflictState.local,
        'Before remote reload',
        token
      );
    } catch { /* best-effort */ }
    const remote = conflictState.remote;
    loadSchedule(conflictState.scheduleName, remote);
    updateBaseline(remote.savedAt ?? 0);
    setSyncStatus('synced');
    setConflictData(null);
  }

  function closeSchedule() {
    if (dirty) {
      if (!confirm('Close this schedule? Unsaved changes will be lost.')) return;
    }
    // Bust the Next.js router cache so LibraryPage remounts and re-fetches
    // rather than being reactivated from the stale client-side cache.
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
