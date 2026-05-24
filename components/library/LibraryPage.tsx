'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useCmsStore } from '@/lib/store/cmsStore';
import { listSchedules, postLoad } from '@/lib/api/load';
import { postDelete } from '@/lib/api/save';
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

interface RecentEntry {
  name: string;
  projectName: string;
  phase: string;
  savedAt: number;
}

const LS_RECENT_KEY = 'rp_recent_schedules';
const MAX_RECENT = 5;

// ── Local mutation guard ────────────────────────────────────────────────────────
// Protects recent archive/restore actions from being undone by a stale Blob read
// during the Netlify Blobs eventual-consistency propagation window (~0–15 s).

const MUTATION_TTL_MS = 60_000; // 60 s — well past the observed ~15 s window

interface LibraryMutation {
  archived: boolean; // true = archived, false = active/restored
  changedAt: number;
}

// Merges pending mutations into freshly-fetched libMeta before setting state.
// Removes mutations that the cloud has confirmed or that have expired.
function applyPendingMutations(
  meta: LibraryData,
  mutations: Map<string, LibraryMutation>,
): LibraryData {
  if (mutations.size === 0) return meta;
  const now = Date.now();
  let tsarchived = meta.tsarchived ? [...meta.tsarchived] : [];
  let changed = false;

  for (const [name, mut] of mutations) {
    if (now - mut.changedAt > MUTATION_TTL_MS) {
      console.log('[Library Mutation] expired:', name);
      mutations.delete(name);
      continue;
    }
    const cloudArchived = tsarchived.includes(name);
    if (cloudArchived === mut.archived) {
      console.log('[Library Mutation] confirmed by cloud:', name, 'archived=', mut.archived);
      mutations.delete(name);
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
    if (!hydrated) return;
    if (!token) { router.push('/login'); return; }
    loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token]);

  // Core data fetcher — fetches everything and updates state. Can throw; callers manage UI state.
  async function fetchLibraryData(): Promise<void> {
    const [names, meta] = await Promise.all([listSchedules(token!), getLibraryMeta(token!)]);

    // Apply any pending local mutations before committing cloud state to React,
    // so a stale Blob read during the propagation window doesn't revert an archive.
    setLibMeta(applyPendingMutations(meta, pendingMutationsRef.current));

    // Protect a recently saved schedule from vanishing due to a stale list read.
    let effectiveNames = names;
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

    setSchedules(effectiveNames.map((name) => ({ name, data: null, loading: true })));

    const fetched = await Promise.all(
      names.map((name) =>
        postLoad(name, token!)
          .then((data): LibrarySchedule => ({ name, data: data as ScheduleData, loading: false }))
          .catch((): LibrarySchedule => ({ name, data: null, loading: false }))
      )
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

  // Pending archive/restore mutations — guards against stale Blob reads reverting them.
  const pendingMutationsRef = useRef<Map<string, LibraryMutation>>(new Map());

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
    } catch (err) {
      console.error('[Library] metadata save failed', err);
      setLibMeta(prevMeta);
      setRefreshError('Could not save library changes. Please try again.');
      throw err;
    }
  }

  // ── Archive / Restore / Delete permanently ─────────────────────────────────

  async function handleArchive(name: string) {
    pendingMutationsRef.current.set(name, { archived: true, changedAt: Date.now() });
    console.log('[Library Mutation] recorded:', name, 'archived=true');

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

    try {
      await updateLibMeta({ ...libMeta, tsarchived: archived, phaseOrder: po, updatedAt: Date.now() });
      // No follow-up GET: putLibraryMeta's POST response already returns the
      // confirmed server state. A second read races the blob propagation window
      // and returns stale pre-archive data, which would revert the UI.
    } catch {
      // updateLibMeta already reverted state and set refreshError.
      // Remove pending mutation so a future Refresh doesn't incorrectly apply the failed archive.
      pendingMutationsRef.current.delete(name);
    }
  }

  async function handleRestore(name: string) {
    pendingMutationsRef.current.set(name, { archived: false, changedAt: Date.now() });
    console.log('[Library Mutation] recorded:', name, 'archived=false');

    const archived = (libMeta.tsarchived ?? []).filter((n) => n !== name);
    try {
      await updateLibMeta({ ...libMeta, tsarchived: archived, updatedAt: Date.now() });
      // Same reason as handleArchive — no follow-up GET needed.
    } catch {
      pendingMutationsRef.current.delete(name);
    }
  }

  async function handleDeletePermanently(name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    const deletePassword = (prompt('Enter delete password:') ?? '').trim();
    if (!deletePassword) { alert('Delete cancelled — schedule kept.'); return; }
    try {
      await postDelete(name, token!, deletePassword);
      setSchedules((prev) => prev.filter((s) => s.name !== name));

      const archived = (libMeta.tsarchived ?? []).filter((n) => n !== name);
      const po: NonNullable<LibraryData['phaseOrder']> = JSON.parse(JSON.stringify(libMeta.phaseOrder ?? {}));
      for (const pk of Object.keys(po)) {
        for (const phk of Object.keys(po[pk])) {
          po[pk][phk] = po[pk][phk].filter((n) => n !== name);
        }
      }
      await updateLibMeta({ ...libMeta, tsarchived: archived, phaseOrder: po, updatedAt: Date.now() });
    } catch (e) {
      const msg = (e as Error).message ?? '';
      alert(/invalid delete password/i.test(msg)
        ? 'Invalid delete password. The schedule was not removed.'
        : msg || 'Delete did not complete — check your connection.');
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="lib-page">
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
                  onUpdateLibMeta={updateLibMeta}
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
