'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';
import { useScheduleStore } from '../store/scheduleStore';
import { postSave } from '../api/save';
import { useDocumentRequest } from './useDocumentRequest';
import type { Snapshot } from '../types';

export function useSnapshotActions() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const name = useScheduleStore((s) => s.scheduleName);
  const { beginRequest, isCurrent } = useDocumentRequest(name);

  async function saveSnapshot(snapshot: Snapshot, copyName?: string): Promise<string | null> {
    if (!token || !name) return null;
    const request = beginRequest();
    const target = copyName ?? name;
    try {
      const result = await postSave(target, snapshot.data, token,
        copyName ? { createOnly: true } : { force: true });
      if (copyName) {
        // Cache a successful copy even when navigation or editing means we should
        // leave the current document alone. The Library can still show the copy.
        try {
          sessionStorage.setItem('rp_recently_added_schedule', JSON.stringify({ name: target, addedAt: Date.now() }));
          sessionStorage.setItem('rp_recently_saved_meta', JSON.stringify({
            name: target, meta: snapshot.data.meta, savedAt: result.savedAt, addedAt: Date.now(),
          }));
        } catch {}
      }
      if (!isCurrent(request)) return null;
      const state = useScheduleStore.getState();
      const changed = request.revision !== state.editRevision;
      if (changed && copyName) return 'Snapshot saved as a new schedule in the Library. Your newer edits are still open.';
      if (!changed) state.loadSchedule(target, { ...snapshot.data, savedAt: result.savedAt });
      state.setRemoteBaseline(result.savedAt, '');
      state.setSyncStatus(changed ? 'pending' : 'synced');
      state.setConflictData(null);
      if (copyName) router.push(`/schedule/${encodeURIComponent(target)}`);
      return changed
        ? 'Snapshot restored in the cloud. Your newer edits are preserved here and still need saving.'
        : (copyName ? 'Snapshot saved as a new schedule.' : 'Snapshot restored.');
    } catch (error) {
      if (!isCurrent(request)) return null;
      throw error;
    }
  }
  return {
    restore: (snapshot: Snapshot) => saveSnapshot(snapshot),
    saveAsNew: (snapshot: Snapshot, newName: string) => saveSnapshot(snapshot, newName),
  };
}
