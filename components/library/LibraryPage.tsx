'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useCmsStore } from '@/lib/store/cmsStore';
import { listSchedules, postLoad } from '@/lib/api/load';
import { postDeleteSchedule, postRenameSchedule } from '@/lib/api/save';
import { getLibraryMeta, putLibraryMeta, type LibraryData } from '@/lib/api/library';
import type { ScheduleData } from '@/lib/types';
import ScheduleListTab, { type LibrarySchedule } from './ScheduleListTab';
import LibrarySearch from './LibrarySearch';
import TemplatesTab from './TemplatesTab';
import VersionsTab from './VersionsTab';
import BackupTab from './BackupTab';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'schedules' | 'templates' | 'backup' | 'versions';
type FilterStatus = 'active' | 'archived' | 'all';
type SortMode = 'savedAt' | 'name' | 'dateAsc' | 'dateDesc';

interface DeleteModalState {
  name: string;
  passcode: string;
  confirmText: string;
  submitting: boolean;
  error: string | null;
}

interface RenameModalState {
  name: string;
  draft: string;
  submitting: boolean;
  error: string | null;
}

interface RecentEntry {
  name: string;
  projectName: string;
  phase: string;
  savedAt: number;
}

const LS_RECENT_KEY = 'rp_recent_schedules';
const MAX_RECENT = 5;

// Blob CDN propagation guard: block open/re-rename for this window after a rename.
const RENAME_SYNC_MS = 15_000;

// ── Local mutation guard ────────────────────────────────────────────────────────
// Protects recent archive/restore actions from being undone by a stale Blob read
// during the Netlify Blobs eventual-consistency propagation window (~0–15 s).
//
// State is kept in sessionStorage (not useRef) so it survives in-session
// navigation: archiving then immediately opening a schedule and returning to
// the Library would otherwise reset the ref and lose the guard.

const MUTATION_TTL_MS = 60_000; // 60 s — well past the observed ~15 s window

interface LibraryMutation {
  archived: boolean; // true = archived, false = active/restored
  changedAt: number;
}

type PendingPhaseOrder = {
  phaseOrder: NonNullable<LibraryData['phaseOrder']>;
  changedAt: number;
};

const SS_MUTATIONS_KEY   = 'rp_lib_pending_mutations';
const SS_PHASE_ORDER_KEY = 'rp_lib_pending_phase_order';

function readPendingMutations(): Map<string, LibraryMutation> {
  try {
    const raw = sessionStorage.getItem(SS_MUTATIONS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, LibraryMutation][]);
  } catch { return new Map(); }
}

function writePendingMutations(m: Map<string, LibraryMutation>) {
  try { sessionStorage.setItem(SS_MUTATIONS_KEY, JSON.stringify([...m.entries()])); } catch {}
}

function setPendingMutation(name: string, mut: LibraryMutation) {
  const m = readPendingMutations();
  m.set(name, mut);
  writePendingMutations(m);
}

function deletePendingMutation(name: string) {
  const m = readPendingMutations();
  m.delete(name);
  writePendingMutations(m);
}

function readPendingPhaseOrder(): PendingPhaseOrder | null {
  try {
    const raw = sessionStorage.getItem(SS_PHASE_ORDER_KEY);
    return raw ? (JSON.parse(raw) as PendingPhaseOrder) : null;
  } catch { return null; }
}

function writePendingPhaseOrder(po: PendingPhaseOrder | null) {
  try {
    if (po === null) sessionStorage.removeItem(SS_PHASE_ORDER_KEY);
    else sessionStorage.setItem(SS_PHASE_ORDER_KEY, JSON.stringify(po));
  } catch {}
}

// ── Pending deletion guard ─────────────────────────────────────────────────────
// Protects recently deleted schedules from reappearing due to stale blob-list or
// library-metadata CDN reads during the eventual-consistency propagation window.

const SS_DELETIONS_KEY = 'rp_lib_pending_deletions';

interface PendingDeletion {
  deletedAt: number;
}

function readPendingDeletions(): Map<string, PendingDeletion> {
  try {
    const raw = sessionStorage.getItem(SS_DELETIONS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, PendingDeletion][]);
  } catch { return new Map(); }
}

function writePendingDeletions(m: Map<string, PendingDeletion>) {
  try { sessionStorage.setItem(SS_DELETIONS_KEY, JSON.stringify([...m.entries()])); } catch {}
}

function setPendingDeletion(name: string) {
  const m = readPendingDeletions();
  m.set(name, { deletedAt: Date.now() });
  writePendingDeletions(m);
}

function clearPendingDeletion(name: string) {
  const m = readPendingDeletions();
  m.delete(name);
  writePendingDeletions(m);
}

// ── Library rename patch ───────────────────────────────────────────────────────
// Defensively re-applies oldName → newName to all library metadata fields.
// The backend does this too, but its CDN read of the library may be stale, so
// we patch client-side to guarantee no oldName survives in the local state.
function patchLibraryRename(lib: LibraryData, oldName: string, newName: string): LibraryData {
  let out = { ...lib };
  if (out.tsarchived?.includes(oldName)) {
    out = { ...out, tsarchived: out.tsarchived.map((n) => (n === oldName ? newName : n)) };
  }
  if (out.scheduleFolderMap && oldName in out.scheduleFolderMap) {
    const sfm = { ...out.scheduleFolderMap, [newName]: out.scheduleFolderMap[oldName] };
    delete sfm[oldName];
    out = { ...out, scheduleFolderMap: sfm };
  }
  if (out.townCache && oldName in out.townCache) {
    const tc = { ...out.townCache, [newName]: out.townCache[oldName] };
    delete tc[oldName];
    out = { ...out, townCache: tc };
  }
  if (out.dateCache && oldName in out.dateCache) {
    const dc = { ...out.dateCache, [newName]: out.dateCache[oldName] };
    delete dc[oldName];
    out = { ...out, dateCache: dc };
  }
  if (out.phaseOrder) {
    const po: NonNullable<LibraryData['phaseOrder']> = {};
    for (const [pk, phases] of Object.entries(out.phaseOrder)) {
      po[pk] = {};
      for (const [phk, order] of Object.entries(phases)) {
        po[pk][phk] = order.map((n) => (n === oldName ? newName : n));
      }
    }
    out = { ...out, phaseOrder: po };
  }
  return out;
}

// ── Pending rename guard ───────────────────────────────────────────────────────
// Prevents a stale blob-list or library-meta CDN read from reverting a confirmed
// rename back to the old name during the eventual-consistency propagation window.

const SS_RENAMES_KEY = 'rp_lib_pending_renames';

interface PendingRename {
  newName: string;
  renamedAt: number;
}

function readPendingRenames(): Map<string, PendingRename> {
  try {
    const raw = sessionStorage.getItem(SS_RENAMES_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, PendingRename][]);
  } catch { return new Map(); }
}

function writePendingRenames(m: Map<string, PendingRename>) {
  try { sessionStorage.setItem(SS_RENAMES_KEY, JSON.stringify([...m.entries()])); } catch {}
}

function setPendingRename(oldName: string, newName: string) {
  const m = readPendingRenames();
  m.set(oldName, { newName, renamedAt: Date.now() });
  writePendingRenames(m);
}

function clearPendingRename(oldName: string) {
  const m = readPendingRenames();
  m.delete(oldName);
  writePendingRenames(m);
}

// ── Rename-back allowance guard ────────────────────────────────────────────────
// After rename A→B, records B's immediate predecessor A for 5 minutes.
// Lets the user rename B back to A even if stale CDN still shows A in the blob list.

const SS_RENAME_PREV_KEY = 'rp_lib_rename_prev';
const RENAME_PREV_TTL_MS = 5 * 60_000;

interface RenamePrevEntry { prevName: string; renamedAt: number; }

function readRenamePrevMap(): Map<string, RenamePrevEntry> {
  try {
    const raw = sessionStorage.getItem(SS_RENAME_PREV_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, RenamePrevEntry][]);
  } catch { return new Map(); }
}

function writeRenamePrevMap(m: Map<string, RenamePrevEntry>) {
  try { sessionStorage.setItem(SS_RENAME_PREV_KEY, JSON.stringify([...m.entries()])); } catch {}
}

function setRenamePrev(currentName: string, prevName: string) {
  const m = readRenamePrevMap();
  m.set(currentName, { prevName, renamedAt: Date.now() });
  writeRenamePrevMap(m);
}

function isRenameBackAllowed(currentName: string, targetName: string): boolean {
  try {
    const m = readRenamePrevMap();
    const entry = m.get(currentName);
    if (!entry) return false;
    if (Date.now() - entry.renamedAt > RENAME_PREV_TTL_MS) {
      m.delete(currentName);
      writeRenamePrevMap(m);
      return false;
    }
    return entry.prevName === targetName;
  } catch { return false; }
}

// Merges pending archive/restore mutations into freshly-fetched libMeta.
// Reads and writes sessionStorage directly so it works across navigations.
function applyPendingMutations(meta: LibraryData): LibraryData {
  const mutations = readPendingMutations();
  if (mutations.size === 0) return meta;

  const now = Date.now();
  let tsarchived = meta.tsarchived ? [...meta.tsarchived] : [];
  let changed = false;
  let mutationsChanged = false;

  for (const [name, mut] of mutations) {
    if (now - mut.changedAt > MUTATION_TTL_MS) {
      console.log('[Library Mutation] expired:', name);
      mutations.delete(name);
      mutationsChanged = true;
      continue;
    }
    const cloudArchived = tsarchived.includes(name);
    if (cloudArchived === mut.archived) {
      console.log('[Library Mutation] confirmed by cloud:', name, 'archived=', mut.archived);
      mutations.delete(name);
      mutationsChanged = true;
      continue;
    }
    // Cloud returned stale pre-mutation state — keep the local confirmed value.
    console.log('[Library Mutation] stale cloud ignored for', name,
      '— cloud archived=', cloudArchived, '→ keeping local archived=', mut.archived);
    if (mut.archived) {
      tsarchived = [...tsarchived, name];
    } else {
      tsarchived = tsarchived.filter((n) => n !== name);
    }
    changed = true;
  }

  if (mutationsChanged) writePendingMutations(mutations);
  return changed ? { ...meta, tsarchived } : meta;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function readRecent(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]'); }
  catch { return []; }
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter();
  const token      = useAuthStore((s) => s.token);
  const hydrated   = useAuthStore((s) => s.hydrated);
  const logout     = useAuthStore((s) => s.logout);
  const openCmsModal = useCmsStore((s) => s.openModal);

  const [tab, setTab]             = useState<Tab>('schedules');
  const [schedules, setSchedules] = useState<LibrarySchedule[]>([]);
  const [libMeta, setLibMeta]     = useState<LibraryData>({ version: 1, folders: [], scheduleFolderMap: {}, updatedAt: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Post-rename sync guard: maps newName → expiry timestamp (Date.now() + RENAME_SYNC_MS).
  // During this window, opening or re-renaming the schedule is blocked to prevent
  // a blank editor (blob CDN hasn't fully propagated the new key yet).
  const [syncingRenames, setSyncingRenames] = useState<Map<string, number>>(new Map());

  // Search / filter / sort
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>('active');
  const [filterProd,     setFilterProd]     = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sortMode,       setSortMode]       = useState<SortMode>('savedAt');

  // Recent
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => { setRecent(readRecent()); }, []);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Auto-expire the post-rename sync guard entries.
  useEffect(() => {
    if (syncingRenames.size === 0) return;
    const minExpiry = Math.min(...syncingRenames.values());
    const delay = Math.max(50, minExpiry - Date.now());
    const t = setTimeout(() => {
      setSyncingRenames((prev) => {
        const now = Date.now();
        const next = new Map([...prev].filter(([, exp]) => exp > now));
        return next.size !== prev.size ? next : prev;
      });
    }, delay);
    return () => clearTimeout(t);
  }, [syncingRenames]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.push('/login'); return; }
    loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token]);

  // Core data fetcher — fetches everything and updates state. Can throw; callers manage UI state.
  async function fetchLibraryData(): Promise<void> {
    const [names, meta] = await Promise.all([listSchedules(token!), getLibraryMeta(token!)]);

    // Apply any pending archive/restore mutations before committing cloud state
    // to React, so a stale Blob read during the propagation window doesn't
    // revert a confirmed archive/restore. Reads/writes sessionStorage internally
    // so the guard survives in-session navigation (ref would be lost on unmount).
    let resolvedMeta = applyPendingMutations(meta);

    // Apply pending DnD phaseOrder, same rationale.
    const pendingPO = readPendingPhaseOrder();
    if (pendingPO) {
      if (Date.now() - pendingPO.changedAt > MUTATION_TTL_MS) {
        console.log('[Library PhaseOrder] pending phaseOrder expired');
        writePendingPhaseOrder(null);
      } else {
        // Deep-merge: pending wins for any (prodKey, phaseKey) it covers.
        const merged = { ...(resolvedMeta.phaseOrder ?? {}) };
        for (const [pk, phases] of Object.entries(pendingPO.phaseOrder)) {
          merged[pk] = { ...(merged[pk] ?? {}), ...phases };
        }
        // If cloud has caught up (its phaseOrder already matches pending), clear it.
        const cloudCaughtUp = Object.entries(pendingPO.phaseOrder).every(([pk, phases]) =>
          Object.entries(phases).every(([phk, order]) =>
            JSON.stringify(resolvedMeta.phaseOrder?.[pk]?.[phk]) === JSON.stringify(order)
          )
        );
        if (cloudCaughtUp) {
          console.log('[Library PhaseOrder] cloud confirmed phaseOrder — clearing pending');
          writePendingPhaseOrder(null);
        } else {
          console.log('[Library PhaseOrder] stale CDN read — applying pending phaseOrder');
          resolvedMeta = { ...resolvedMeta, phaseOrder: merged };
        }
      }
    }

    console.log('[Library Refresh] confirmed phaseOrder keys:', Object.keys(resolvedMeta.phaseOrder ?? {}));

    // Apply pending deletions: filter deleted schedules from both the name list and tsarchived
    // so that a stale CDN blob-list or library-meta read cannot resurrect a just-deleted schedule.
    let effectiveNames = names;
    try {
      const deletions = readPendingDeletions();
      const now = Date.now();
      let deletionsChanged = false;
      for (const [dname, { deletedAt }] of deletions) {
        if (now - deletedAt > MUTATION_TTL_MS) {
          deletions.delete(dname);
          deletionsChanged = true;
          console.log('[Library Deletion] pending deletion expired:', dname);
        }
      }
      if (deletionsChanged) writePendingDeletions(deletions);
      if (deletions.size > 0) {
        const deletedSet = new Set(deletions.keys());
        effectiveNames = effectiveNames.filter((n) => !deletedSet.has(n));
        const cleanedTs = resolvedMeta.tsarchived?.filter((n) => !deletedSet.has(n));
        if (cleanedTs?.length !== (resolvedMeta.tsarchived?.length ?? 0)) {
          resolvedMeta = { ...resolvedMeta, tsarchived: cleanedTs };
        }
        console.log('[Library Deletion] filtered', deletions.size, 'recently deleted schedule(s) from list');
      }
    } catch {}

    // Apply pending renames: remap stale oldName → newName in name list and tsarchived
    try {
      const renames = readPendingRenames();
      const now = Date.now();
      let renamesChanged = false;
      for (const [oldName, { newName, renamedAt }] of renames) {
        if (now - renamedAt > MUTATION_TTL_MS) {
          renames.delete(oldName);
          renamesChanged = true;
          console.log('[Library Rename] pending rename expired:', oldName);
          continue;
        }
        const oldPresent = effectiveNames.includes(oldName);
        const newPresent = effectiveNames.includes(newName);
        if (!oldPresent && newPresent) {
          renames.delete(oldName);
          renamesChanged = true;
          console.log('[Library Rename] cloud confirmed rename:', oldName, '→', newName);
          continue;
        }
        if (oldPresent && newPresent) {
          // Both blob keys exist simultaneously (old not yet deleted from CDN list).
          // Mapping oldName → newName here would produce a duplicate newName entry.
          // Instead, filter the stale oldName out and strip it from phaseOrder.
          effectiveNames = effectiveNames.filter((n) => n !== oldName);
          if (resolvedMeta.phaseOrder) {
            const fixedPO: NonNullable<LibraryData['phaseOrder']> = {};
            for (const [pk, phases] of Object.entries(resolvedMeta.phaseOrder)) {
              fixedPO[pk] = {};
              for (const [phk, order] of Object.entries(phases)) {
                fixedPO[pk][phk] = order.filter((n) => n !== oldName);
              }
            }
            resolvedMeta = { ...resolvedMeta, phaseOrder: fixedPO };
          }
          console.log('[Library Rename] both names in list — removed stale old name:', oldName);
        } else if (oldPresent) {
          // Only oldName present — CDN stale, remap to newName preserving position.
          effectiveNames = effectiveNames.map((n) => n === oldName ? newName : n);
          const cloudArchived = resolvedMeta.tsarchived ?? [];
          if (cloudArchived.includes(oldName)) {
            resolvedMeta = {
              ...resolvedMeta,
              tsarchived: cloudArchived.map((n) => n === oldName ? newName : n),
            };
          }
          // Remap phaseOrder position-preservingly — without this, applyPhaseOrder
          // looks for newName but finds oldName → assigns Infinity index → floats to bottom.
          if (resolvedMeta.phaseOrder) {
            const remappedPO: NonNullable<LibraryData['phaseOrder']> = {};
            for (const [pk, phases] of Object.entries(resolvedMeta.phaseOrder)) {
              remappedPO[pk] = {};
              for (const [phk, order] of Object.entries(phases)) {
                remappedPO[pk][phk] = order.map((n) => n === oldName ? newName : n);
              }
            }
            resolvedMeta = { ...resolvedMeta, phaseOrder: remappedPO };
          }
          console.log('[Library Rename] stale CDN — applied pending rename:', oldName, '→', newName);
        }
      }
      if (renamesChanged) writePendingRenames(renames);
    } catch {}

    setLibMeta(resolvedMeta);

    // Protect a recently saved schedule from vanishing due to a stale list read.
    // (effectiveNames may have already been narrowed by the deletions guard above)
    try {
      const raw = sessionStorage.getItem('rp_recently_added_schedule');
      if (raw) {
        const { name: addedName, addedAt } = JSON.parse(raw) as { name: string; addedAt: number };
        if (Date.now() - addedAt < MUTATION_TTL_MS) {
          if (!effectiveNames.includes(addedName)) {
            console.log('[Library Mutation] stale list missing recently added:', addedName, '— keeping visible');
            effectiveNames = [...effectiveNames, addedName];
          } else {
            console.log('[Library Mutation] recently added schedule confirmed in list:', addedName);
            sessionStorage.removeItem('rp_recently_added_schedule');
          }
        } else {
          sessionStorage.removeItem('rp_recently_added_schedule');
        }
      }
    } catch {}

    // Read recently-saved meta to protect against a stale CDN GET for a newly
    // created schedule blob. store.list uses strong consistency and finds the key,
    // but store.get for a new key can return 404 until the CDN edge catches up.
    // Without this fallback the new schedule shows as Ungrouped (null data).
    type RecentlySavedMeta = { name: string; meta: ScheduleData['meta']; savedAt: number; addedAt: number };
    let recentlySavedMeta: RecentlySavedMeta | null = null;
    try {
      const rsRaw = sessionStorage.getItem('rp_recently_saved_meta');
      if (rsRaw) {
        const parsed = JSON.parse(rsRaw) as RecentlySavedMeta;
        if (parsed && Date.now() - (parsed.addedAt ?? 0) < MUTATION_TTL_MS) {
          recentlySavedMeta = parsed;
          console.log('[SaveAs] pending meta found — will protect Library grouping for:', parsed.name);
        } else {
          sessionStorage.removeItem('rp_recently_saved_meta');
        }
      }
    } catch {}

    setSchedules(effectiveNames.map((name) => ({ name, data: null, loading: true })));

    // Use effectiveNames (not names) so that a recently-added schedule that has not
    // yet propagated through the Blob CDN list is also fetched and gets the meta
    // fallback applied. Using `names` here would silently drop it from the fetched array.
    const fetched = await Promise.all(
      effectiveNames.map((name) => {
        const fallback = recentlySavedMeta?.name === name
          ? { rows: [], meta: recentlySavedMeta.meta, savedAt: recentlySavedMeta.savedAt } as ScheduleData
          : null;
        return postLoad(name, token!)
          .then((data): LibrarySchedule => {
            if (data !== null && recentlySavedMeta?.name === name) {
              console.log('[SaveAs] CDN confirmed data for:', name, '— clearing cached meta');
              sessionStorage.removeItem('rp_recently_saved_meta');
              recentlySavedMeta = null;
            }
            if (data === null && fallback) {
              console.log('[SaveAs] CDN stale — using cached meta for Library grouping:', name,
                '— projectName:', fallback.meta?.projectName, '/ phase:', fallback.meta?.phase);
              return { name, data: fallback, loading: false };
            }
            if (data === null) {
              console.log('[Library] postLoad returned null for', name, '— no cached meta, will appear ungrouped');
            }
            return { name, data: data as ScheduleData, loading: false };
          })
          .catch((): LibrarySchedule => {
            if (fallback) {
              console.log('[SaveAs] postLoad threw — using cached meta for Library grouping:', name);
              return { name, data: fallback, loading: false };
            }
            return { name, data: null, loading: false };
          });
      })
    );
    setSchedules(fetched);

    try {
      const projectNames = [...new Set(
        fetched.flatMap((s) => { const n = s.data?.meta?.projectName?.trim(); return n ? [n] : []; })
      )];
      const phases = [...new Set(
        fetched.flatMap((s) => { const p = s.data?.meta?.phase?.trim(); return p ? [p] : []; })
      )];
      localStorage.setItem('rp_lib_project_options', JSON.stringify(projectNames));
      localStorage.setItem('rp_lib_phase_options', JSON.stringify(phases));
    } catch {}
  }

  // Initial / automatic load — drives the full-page loading spinner.
  async function loadLibrary() {
    setLoadingList(true);
    try {
      await fetchLibraryData();
    } catch {
      // silently keep whatever state we have
    } finally {
      setLoadingList(false);
    }
  }

  // Manual refresh — drives only the Refresh button state. Ref guards against duplicate clicks.
  const refreshInProgressRef = useRef(false);

  async function handleRefresh() {
    if (refreshInProgressRef.current) return;

    refreshInProgressRef.current = true;
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      console.log('[Library Refresh] started');
      await fetchLibraryData();
      console.log('[Library Refresh] cloud fetch completed');
      console.log('[Library Refresh] render completed');
    } catch (error) {
      console.error('[Library Refresh] failed', error);
      setRefreshError('Could not refresh the Library. Please try again.');
    } finally {
      refreshInProgressRef.current = false;
      setIsRefreshing(false);
      console.log('[Library Refresh] state reset');
    }
  }

  async function updateLibMeta(updated: LibraryData): Promise<void> {
    const prevMeta = libMeta;
    setLibMeta(updated);
    console.log('[Library] metadata save started');
    try {
      const saved = await putLibraryMeta(updated, token!);
      setLibMeta(saved);
      console.log('[Library] metadata save succeeded');

      // If phaseOrder changed, protect it against stale CDN reads during the propagation window.
      // Written to sessionStorage so the guard survives in-session navigation.
      if (JSON.stringify(updated.phaseOrder) !== JSON.stringify(prevMeta.phaseOrder)) {
        writePendingPhaseOrder({ phaseOrder: updated.phaseOrder ?? {}, changedAt: Date.now() });
        console.log('[Library PhaseOrder] pending phaseOrder recorded');
      }
    } catch (err) {
      console.error('[Library] metadata save failed', err);
      setLibMeta(prevMeta);
      setRefreshError(`Library save failed: ${(err as Error).message ?? 'unknown error'}`);
      throw err;
    }
  }

  // ── Archive / Restore / Delete permanently ─────────────────────────────────

  async function handleArchive(name: string) {
    // Record in sessionStorage before the save so the guard survives in-session
    // navigation (e.g. user archives then immediately opens another schedule).
    setPendingMutation(name, { archived: true, changedAt: Date.now() });
    console.log('[Library Archive] local mutation recorded:', name);

    const archived = [...(libMeta.tsarchived ?? [])];
    if (!archived.includes(name)) archived.push(name);

    const po: NonNullable<LibraryData['phaseOrder']> = JSON.parse(JSON.stringify(libMeta.phaseOrder ?? {}));
    for (const pk of Object.keys(po)) {
      for (const phk of Object.keys(po[pk])) {
        po[pk][phk] = po[pk][phk].filter((n) => n !== name);
      }
    }

    try {
      const prev = readRecent();
      const next = prev.filter((r) => r.name !== name);
      localStorage.setItem(LS_RECENT_KEY, JSON.stringify(next));
      setRecent(next);
    } catch {}

    console.log('[Library Archive] save started:', name);
    try {
      await updateLibMeta({ ...libMeta, tsarchived: archived, phaseOrder: po, updatedAt: Date.now() });
      console.log('[Library Archive] save succeeded:', name);
      // No follow-up GET: putLibraryMeta's POST response already returns the
      // confirmed server state. A second read races the blob propagation window
      // and returns stale pre-archive data, which would revert the UI.
    } catch {
      // updateLibMeta already reverted state and set refreshError.
      // Remove pending mutation so a future Refresh doesn't incorrectly apply the failed archive.
      deletePendingMutation(name);
      console.log('[Library Archive] save failed — pending mutation cleared:', name);
    }
  }

  async function handleRestore(name: string) {
    setPendingMutation(name, { archived: false, changedAt: Date.now() });
    console.log('[Library Restore] local mutation recorded:', name);

    const archived = (libMeta.tsarchived ?? []).filter((n) => n !== name);
    console.log('[Library Restore] save started:', name);
    try {
      await updateLibMeta({ ...libMeta, tsarchived: archived, updatedAt: Date.now() });
      console.log('[Library Restore] save succeeded:', name);
      // Same reason as handleArchive — no follow-up GET needed.
    } catch {
      deletePendingMutation(name);
      console.log('[Library Restore] save failed — pending mutation cleared:', name);
    }
  }

  function handleDeletePermanently(name: string) {
    setDeleteModal({ name, passcode: '', confirmText: '', submitting: false, error: null });
  }

  async function handleDeleteConfirm() {
    if (!deleteModal) return;
    const { name, passcode, confirmText } = deleteModal;
    if (confirmText !== 'DELETE') return;

    setDeleteModal((m) => m ? { ...m, submitting: true, error: null } : null);
    console.log('[Library Delete] delete requested for:', name);

    // Record locally before the request so Refresh during the CDN propagation window
    // doesn't resurrect the schedule.
    setPendingDeletion(name);

    try {
      const result = await postDeleteSchedule(name, token!, passcode);
      console.log('[Library Delete] delete succeeded:', name);

      // Remove from UI immediately
      setSchedules((prev) => prev.filter((s) => s.name !== name));

      // Apply the cleaned library metadata returned by the backend if available,
      // otherwise clean it locally.
      if (result.library) {
        setLibMeta(result.library);
      } else {
        setLibMeta((prev) => {
          const tsarchived = (prev.tsarchived ?? []).filter((n) => n !== name);
          const po: NonNullable<LibraryData['phaseOrder']> = JSON.parse(JSON.stringify(prev.phaseOrder ?? {}));
          for (const pk of Object.keys(po)) {
            for (const phk of Object.keys(po[pk])) {
              po[pk][phk] = po[pk][phk].filter((n) => n !== name);
            }
          }
          const sfm = { ...(prev.scheduleFolderMap ?? {}) };
          delete sfm[name];
          return { ...prev, tsarchived, phaseOrder: po, scheduleFolderMap: sfm, updatedAt: Date.now() };
        });
      }

      // Remove from recent
      try {
        const prev = JSON.parse(localStorage.getItem('rp_recent_schedules') || '[]') as { name: string }[];
        localStorage.setItem('rp_recent_schedules', JSON.stringify(prev.filter((r) => r.name !== name)));
        setRecent((r) => r.filter((x) => x.name !== name));
      } catch {}

      setDeleteModal(null);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      console.log('[Library Delete] delete failed:', name, msg);
      // On failure, remove the pending deletion guard — schedule was not deleted.
      clearPendingDeletion(name);
      const friendly = /invalid delete password/i.test(msg)
        ? 'Incorrect passcode — the schedule was not deleted.'
        : msg || 'Delete did not complete. Check your connection and try again.';
      setDeleteModal((m) => m ? { ...m, submitting: false, error: friendly } : null);
    }
  }

  function handleRenameSchedule(name: string) {
    setRenameModal({ name, draft: name, submitting: false, error: null });
  }

  async function handleRenameConfirm() {
    if (!renameModal) return;
    const trimNew = renameModal.draft.trim();
    if (!trimNew || trimNew === renameModal.name) return;

    // Client-side duplicate guard — checks ALL schedules (active + archived) before the
    // network round-trip. Trims both sides to catch blob keys with hidden whitespace.
    // Exception: allow rename-back to the immediate predecessor name in this session
    // (e.g. A→B then B→A), since the stale CDN list may still show A after it was deleted.
    if (schedules.some((s) => s.name.trim() === trimNew) && !isRenameBackAllowed(renameModal.name, trimNew)) {
      setRenameModal((m) => m ? { ...m, error: `A schedule named "${trimNew}" already exists` } : null);
      return;
    }

    setRenameModal((m) => m ? { ...m, submitting: true, error: null } : null);
    const oldName = renameModal.name;
    console.log('[Library Rename] rename requested:', oldName, '→', trimNew);

    // Record before request so Refresh during CDN propagation window doesn't revert
    setPendingRename(oldName, trimNew);

    try {
      const result = await postRenameSchedule(oldName, trimNew, token!);
      console.log('[Library Rename] rename succeeded:', oldName, '→', trimNew);

      setSchedules((prev) => {
        // Position-preserving rename: find oldName's index, remove both oldName and any
        // stale trimNew entry, then re-insert trimNew exactly where oldName sat.
        const idx = prev.findIndex((s) => s.name === oldName);
        const base = idx !== -1
          ? prev[idx]
          : ({ name: trimNew, data: null, loading: false } as (typeof prev)[0]);
        const withoutBoth = prev.filter((s) => s.name !== oldName && s.name !== trimNew);
        // Items before oldName's position that survive the filter = correct insert point
        const insertAt = idx === -1
          ? withoutBoth.length
          : prev.slice(0, idx).filter((s) => s.name !== trimNew).length;
        return [
          ...withoutBoth.slice(0, insertAt),
          { ...base, name: trimNew },
          ...withoutBoth.slice(insertAt),
        ];
      });

      if (result.library) {
        // Patch before applying: backend may have read a stale library from CDN,
        // so oldName could still appear in phaseOrder/caches despite backend remapping.
        setLibMeta(patchLibraryRename(result.library, oldName, trimNew));
      } else {
        setLibMeta((prev) => patchLibraryRename(
          { ...prev, updatedAt: Date.now() },
          oldName,
          trimNew,
        ));
      }

      // Record predecessor so rename-back (B→A) isn't blocked by stale CDN blob list.
      setRenamePrev(trimNew, oldName);

      // Start the CDN sync guard: block open/re-rename for RENAME_SYNC_MS.
      setSyncingRenames((prev) => new Map(prev).set(trimNew, Date.now() + RENAME_SYNC_MS));
      setRenameModal(null);
      setSuccessMessage(`Rename saved. Finalizing cloud sync…`);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      console.log('[Library Rename] rename failed:', oldName, msg);
      clearPendingRename(oldName);
      setRenameModal((m) =>
        m ? { ...m, submitting: false, error: msg || 'Rename did not complete. Please try again.' } : null
      );
    }
  }

  function handleLogout() {
    logout();
    router.push('/login');
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const activeFilterCount = [
    filterProd !== '',
    filterDateFrom !== '',
    filterDateTo !== '',
    filterStatus !== 'active',
  ].filter(Boolean).length;

  const allProductionNames = useMemo(() => {
    return [...new Set(
      schedules.flatMap((s) => {
        const n = s.data?.meta?.projectName?.trim();
        return n ? [n] : [];
      })
    )].sort();
  }, [schedules]);

  // Pre-filter schedules for tree mode
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const isArchived = libMeta.tsarchived?.includes(s.name) ?? false;
      if (filterStatus === 'active' && isArchived) return false;
      if (filterStatus === 'archived' && !isArchived) return false;
      if (filterProd) {
        const proj = s.data?.meta?.projectName?.trim().toLowerCase() ?? '';
        if (proj !== filterProd.toLowerCase()) return false;
      }
      const dateVal = libMeta.dateCache?.[s.name] ?? s.data?.meta?.date ?? '';
      if (filterDateFrom && dateVal && dateVal < filterDateFrom) return false;
      if (filterDateTo && dateVal && dateVal > filterDateTo) return false;
      return true;
    });
  }, [schedules, libMeta, filterStatus, filterProd, filterDateFrom, filterDateTo]);

  // Flat search results (when searchQuery is non-empty)
  const flatResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return filteredSchedules
      .filter((s) => {
        const name  = s.name.toLowerCase();
        const proj  = s.data?.meta?.projectName?.trim().toLowerCase() ?? '';
        const phase = s.data?.meta?.phase?.trim().toLowerCase() ?? '';
        const town  = (libMeta.townCache?.[s.name] ?? '').toLowerCase();
        return name.includes(q) || proj.includes(q) || phase.includes(q) || town.includes(q);
      })
      .sort((a, b) => {
        switch (sortMode) {
          case 'name': return a.name.localeCompare(b.name);
          case 'dateAsc': {
            const da = libMeta.dateCache?.[a.name] || a.data?.meta?.date || '';
            const db = libMeta.dateCache?.[b.name] || b.data?.meta?.date || '';
            return da.localeCompare(db);
          }
          case 'dateDesc': {
            const da = libMeta.dateCache?.[a.name] || a.data?.meta?.date || '';
            const db = libMeta.dateCache?.[b.name] || b.data?.meta?.date || '';
            return db.localeCompare(da);
          }
          default: return (b.data?.savedAt ?? 0) - (a.data?.savedAt ?? 0);
        }
      });
  }, [searchQuery, filteredSchedules, libMeta, sortMode]);

  // Recent (exclude archived)
  const visibleRecent = useMemo(() => {
    return recent.filter((r) => !(libMeta.tsarchived?.includes(r.name)));
  }, [recent, libMeta.tsarchived]);

  const isSearchMode = searchQuery.trim() !== '';
  const showArchived = filterStatus !== 'active';
  const scheduleNames = schedules.map((s) => s.name);

  // Derive the current set of syncing names from the Map (filtered to non-expired).
  // Recomputes whenever syncingRenames changes (i.e. when an entry is added or the
  // cleanup timeout fires and removes expired entries).
  const syncingNamesSet = useMemo(() => {
    const now = Date.now();
    return new Set([...syncingRenames.entries()].filter(([, exp]) => exp > now).map(([n]) => n));
  }, [syncingRenames]);

  // Live duplicate detection for the rename modal — computed on every render so
  // the inline error and disabled state update as the user types.
  // Checks ALL schedules (active + archived) and trims both sides for robustness.
  const isRenameDuplicate =
    renameModal !== null &&
    renameModal.draft.trim() !== '' &&
    renameModal.draft.trim() !== renameModal.name &&
    !isRenameBackAllowed(renameModal.name, renameModal.draft.trim()) &&
    schedules.some((s) => s.name.trim() === renameModal.draft.trim());

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="lib-page">
      {/* Permanent delete modal */}
      {deleteModal && (
        <div
          className="lbt-modal-overlay"
          onClick={() => !deleteModal.submitting && setDeleteModal(null)}
        >
          <div className="lbt-modal lbt-modal--delete" onClick={(e) => e.stopPropagation()}>
            <h2 className="lbt-modal-title">Permanently Delete Schedule</h2>
            <p className="lbt-delete-warning">
              This will permanently delete <strong>{deleteModal.name}</strong> and all its
              snapshots. <strong>This cannot be undone.</strong>
            </p>

            <div className="lbt-modal-label">Delete passcode</div>
            <input
              className="lbt-modal-input"
              type="password"
              autoFocus
              placeholder="Enter passcode…"
              value={deleteModal.passcode}
              disabled={deleteModal.submitting}
              onChange={(e) => setDeleteModal((m) => m ? { ...m, passcode: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !deleteModal.submitting) setDeleteModal(null);
              }}
            />

            <div className="lbt-modal-label">Type DELETE to confirm</div>
            <input
              className="lbt-modal-input"
              type="text"
              placeholder="DELETE"
              value={deleteModal.confirmText}
              disabled={deleteModal.submitting}
              onChange={(e) => setDeleteModal((m) => m ? { ...m, confirmText: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !deleteModal.submitting
                    && deleteModal.passcode.trim() && deleteModal.confirmText === 'DELETE') {
                  handleDeleteConfirm();
                }
                if (e.key === 'Escape' && !deleteModal.submitting) setDeleteModal(null);
              }}
            />

            {deleteModal.error && (
              <p className="lbt-modal-error">{deleteModal.error}</p>
            )}

            <div className="lbt-modal-actions">
              <button
                className="btn btn-light btn-sm"
                onClick={() => setDeleteModal(null)}
                disabled={deleteModal.submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-delete btn-sm"
                onClick={handleDeleteConfirm}
                disabled={
                  deleteModal.submitting ||
                  !deleteModal.passcode.trim() ||
                  deleteModal.confirmText !== 'DELETE'
                }
              >
                {deleteModal.submitting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renameModal && (
        <div
          className="lbt-modal-overlay"
          onClick={() => !renameModal.submitting && setRenameModal(null)}
        >
          <div className="lbt-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="lbt-modal-title">Rename Schedule</h2>
            <div className="lbt-modal-label">New name</div>
            <input
              className="lbt-modal-input"
              type="text"
              autoFocus
              value={renameModal.draft}
              disabled={renameModal.submitting}
              onChange={(e) => setRenameModal((m) => m ? { ...m, draft: e.target.value, error: null } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !renameModal.submitting && !isRenameDuplicate
                    && renameModal.draft.trim() && renameModal.draft.trim() !== renameModal.name) {
                  handleRenameConfirm();
                }
                if (e.key === 'Escape' && !renameModal.submitting) setRenameModal(null);
              }}
            />
            {isRenameDuplicate && (
              <p className="lbt-modal-error">
                A schedule named &ldquo;{renameModal.draft.trim()}&rdquo; already exists.
              </p>
            )}
            {!isRenameDuplicate && renameModal.error && (
              <p className="lbt-modal-error">{renameModal.error}</p>
            )}
            <div className="lbt-modal-actions">
              <button
                className="btn btn-light btn-sm"
                onClick={() => setRenameModal(null)}
                disabled={renameModal.submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-pink btn-sm"
                onClick={handleRenameConfirm}
                disabled={
                  renameModal.submitting ||
                  !renameModal.draft.trim() ||
                  renameModal.draft.trim() === renameModal.name ||
                  isRenameDuplicate
                }
              >
                {renameModal.submitting ? 'Renaming…' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="lib-header">
        <h1 className="lib-title">Library</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-pink btn-sm" onClick={() => router.push('/schedule/Untitled')}>
            + New Schedule
          </button>
          <button
            className="btn btn-light btn-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Re-fetch the latest schedules from the cloud"
          >
            {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button
            className={`btn btn-light btn-sm${showArchived ? ' lib-archived-toggle--on' : ''}`}
            onClick={() => setFilterStatus(showArchived ? 'active' : 'all')}
            title={showArchived ? 'Hide archived schedules' : 'Show archived schedules'}
          >
            {showArchived ? '⊘ Archived On' : 'Show Archived'}
          </button>
          <button className="btn btn-light btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
          <button className="btn btn-light btn-sm" onClick={handleLogout}>Log Out</button>
        </div>
      </div>
      {refreshError && (
        <div className="lib-refresh-error" role="alert">
          {refreshError}
          <button className="lib-refresh-error-dismiss" onClick={() => setRefreshError(null)}>✕</button>
        </div>
      )}
      {successMessage && (
        <div className="lib-success-notice" role="status">
          {successMessage}
          <button className="lib-success-notice-dismiss" onClick={() => setSuccessMessage(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mtabs lib-tabs">
        <button className={`mtab${tab === 'schedules' ? ' active' : ''}`} onClick={() => setTab('schedules')}>
          📁 Library
        </button>
        <button className={`mtab${tab === 'templates' ? ' active' : ''}`} onClick={() => setTab('templates')}>
          ★ Templates
        </button>
        <button className={`mtab${tab === 'backup' ? ' active' : ''}`} onClick={() => setTab('backup')}>
          &#128279; Backup
        </button>
        <button className={`mtab${tab === 'versions' ? ' active' : ''}`} onClick={() => setTab('versions')}>
          🕐 Restore
        </button>
      </div>

      {/* Tab content */}
      {loadingList && tab === 'schedules' ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className={`mtab-panel${tab === 'schedules' ? ' active' : ''}`}>

            {/* Search + Filter row */}
            <div className="lib-search-row">
              <LibrarySearch value={searchQuery} onChange={setSearchQuery} />
              <div className="lib-search-tools">
                <button
                  className={`btn btn-light btn-sm lib-filter-btn${activeFilterCount > 0 ? ' lib-filter-btn--active' : ''}`}
                  onClick={() => setShowFilterPanel((v) => !v)}
                >
                  {activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter'}
                </button>
                {isSearchMode && (
                  <select
                    className="lib-sort-select"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                  >
                    <option value="savedAt">Last modified</option>
                    <option value="name">Name A→Z</option>
                    <option value="dateAsc">Shoot date oldest</option>
                    <option value="dateDesc">Shoot date newest</option>
                  </select>
                )}
              </div>
            </div>

            {/* Filter panel */}
            {showFilterPanel && (
              <div className="lib-filter-panel">
                <div className="lib-filter-row">
                  <label className="lib-filter-label">Production</label>
                  <select
                    className="lib-filter-select"
                    value={filterProd}
                    onChange={(e) => setFilterProd(e.target.value)}
                  >
                    <option value="">All Productions</option>
                    {allProductionNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="lib-filter-row">
                  <label className="lib-filter-label">Shoot Date</label>
                  <div className="lib-filter-dates">
                    <input
                      type="date"
                      className="lib-filter-date-input"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                    <span className="lib-filter-date-sep">→</span>
                    <input
                      type="date"
                      className="lib-filter-date-input"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="lib-filter-row">
                  <label className="lib-filter-label">Status</label>
                  <div className="lib-filter-status">
                    {(['active', 'archived', 'all'] as FilterStatus[]).map((s) => (
                      <button
                        key={s}
                        className={`lib-filter-status-btn${filterStatus === s ? ' active' : ''}`}
                        onClick={() => setFilterStatus(s)}
                      >
                        {s === 'active' ? 'Active only' : s === 'archived' ? 'Archived only' : 'All'}
                      </button>
                    ))}
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    className="lib-filter-clear"
                    onClick={() => {
                      setFilterProd('');
                      setFilterDateFrom('');
                      setFilterDateTo('');
                      setFilterStatus('active');
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {isSearchMode ? (
              /* ── Flat results mode ─────────────────────────────────────── */
              <div className="lib-flat-results">
                <div className="lib-results-count">
                  {flatResults.length} result{flatResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                </div>
                {flatResults.length === 0 ? (
                  <div className="empty">No schedules match your search.</div>
                ) : (
                  <div className="lib-flat-list">
                    {flatResults.map((s) => {
                      const isArchived = libMeta.tsarchived?.includes(s.name) ?? false;
                      const proj  = s.data?.meta?.projectName?.trim() ?? '';
                      const phase = s.data?.meta?.phase?.trim() ?? '';
                      const town  = libMeta.townCache?.[s.name] ?? s.data?.meta?.town ?? '';
                      const breadcrumb = [proj, phase].filter(Boolean).join(' / ');
                      return (
                        <div
                          key={s.name}
                          className={`lib-flat-item${isArchived ? ' lib-flat-item--archived' : ''}`}
                        >
                          <button
                            className="lib-flat-name"
                            onClick={() => router.push(`/schedule/${encodeURIComponent(s.name)}`)}
                          >
                            {isArchived && <span className="lbt-archived-glyph">⊘ </span>}
                            {s.name}
                          </button>
                          <div className="lib-flat-meta">
                            {breadcrumb && <span className="lib-flat-breadcrumb">{breadcrumb}</span>}
                            {town && <span className="lib-flat-town">{town.split(',')[0].trim()}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Tree mode ─────────────────────────────────────────────── */
              <>
                {/* Recent section */}
                {visibleRecent.length > 0 && (
                  <div className="lib-recent">
                    <div className="lib-recent-label">Recent</div>
                    {visibleRecent.map((r) => (
                      <div key={r.name} className="lib-recent-item">
                        <button
                          className="lib-recent-name"
                          onClick={() => router.push(`/schedule/${encodeURIComponent(r.name)}`)}
                        >
                          {r.name}
                        </button>
                        {[r.projectName, r.phase].filter(Boolean).length > 0 && (
                          <span className="lib-recent-meta">
                            {[r.projectName, r.phase].filter(Boolean).join(' / ')}
                          </span>
                        )}
                        <span className="lib-recent-time">{relativeTime(r.savedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Productions tree */}
                <ScheduleListTab
                  schedules={filteredSchedules}
                  libMeta={libMeta}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onDeletePermanently={handleDeletePermanently}
                  onRename={handleRenameSchedule}
                  onUpdateLibMeta={updateLibMeta}
                  syncingNames={syncingNamesSet}
                />
              </>
            )}
          </div>

          <div className={`mtab-panel${tab === 'templates' ? ' active' : ''}`}>
            <TemplatesTab />
          </div>
          <div className={`mtab-panel${tab === 'backup' ? ' active' : ''}`}>
            <BackupTab schedules={schedules} onRefresh={loadLibrary} />
          </div>
          <div className={`mtab-panel${tab === 'versions' ? ' active' : ''}`}>
            <VersionsTab scheduleNames={scheduleNames} />
          </div>
        </>
      )}
    </div>
  );
}
