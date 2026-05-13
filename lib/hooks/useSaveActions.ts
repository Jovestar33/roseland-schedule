'use client';
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

  async function loadScheduleFromCloud(name: string) {
    // If the store already has this schedule with a remote baseline (e.g. navigation triggered
    // immediately after saveAs), skip the fetch — the data is already current.
    if (scheduleName === name && remoteBaseline !== null) return;
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
        // Use only savedAt for the initial baseline — no client-computed hash.
        // The client hash (JSON.stringify, unsorted keys) differs from the server hash
        // (stableStringify, sorted keys), causing false conflict 409s on every first save.
        // After the first successful save the server returns its own hash, which we store
        // and use for all subsequent conflict checks.
        setRemoteBaseline(normalized.savedAt ?? 0, '');
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
    try {
      const result = await postSave(scheduleName, data, token, {
        expectedSavedAt: remoteBaseline?.savedAt ?? 0,
        expectedHash:    remoteBaseline?.hash    ?? '',
      });
      markClean();
      // Always use the server-returned hash — never a client-computed hash.
      setRemoteBaseline(result.savedAt, result.hash ?? '');
      setSyncStatus('synced');
    } catch (e) {
      const err = e as SaveError;
      if (err.conflict) {
        console.warn('[Save] Conflict detected — baseline:', {
          expectedSavedAt: remoteBaseline?.savedAt ?? 0,
          expectedHash:    remoteBaseline?.hash    ?? '',
          remoteSavedAt:   err.remoteSavedAt,
          remoteHash:      err.remoteHash,
        });
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
      setRemoteBaseline(result.savedAt, result.hash ?? '');
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
      setRemoteBaseline(result.savedAt, result.hash ?? '');
      setSyncStatus('synced');
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
    // Use only savedAt — we don't have the server's hash for the remote version here.
    setRemoteBaseline(remote.savedAt ?? 0, '');
    setSyncStatus('synced');
    setConflictData(null);
  }

  function closeSchedule() {
    if (dirty) {
      if (!confirm('Close this schedule? Unsaved changes will be lost.')) return;
    }
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
