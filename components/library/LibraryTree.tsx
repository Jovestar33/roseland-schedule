'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, type DropResult, type DragStart } from '@hello-pangea/dnd';
import { GripVertical, Pencil } from 'lucide-react';
import type { LibrarySchedule } from './ScheduleListTab';
import type { LibraryData } from '@/lib/api/library';

// Stable empty set used as default for syncingNames to avoid prop identity churn.
const EMPTY_SET = new Set<string>();

// ── Recent schedule localStorage ──────────────────────────────────────────────

const LS_RECENT_KEY = 'rp_recent_schedules';
const MAX_RECENT = 5;

interface RecentEntry {
  name: string;
  projectName: string;
  phase: string;
  savedAt: number;
}

function writeRecent(name: string, schedule: LibrarySchedule | undefined, libMeta: LibraryData) {
  if (libMeta.tsarchived?.includes(name)) return;
  try {
    const prev: RecentEntry[] = JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]');
    const entry: RecentEntry = {
      name,
      projectName: schedule?.data?.meta?.projectName ?? '',
      phase: schedule?.data?.meta?.phase ?? '',
      savedAt: schedule?.data?.savedAt ?? Date.now(),
    };
    const next = [entry, ...prev.filter((r) => r.name !== name)].slice(0, MAX_RECENT);
    localStorage.setItem(LS_RECENT_KEY, JSON.stringify(next));
  } catch {}
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Collapse state ────────────────────────────────────────────────────────────

const LS_COLLAPSE_KEY = 'rp_library_collapse_state';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(LS_COLLAPSE_KEY, JSON.stringify([...set]));
  } catch {}
}

// ── Tree data model ───────────────────────────────────────────────────────────

interface ScheduleLeaf {
  name: string;
  data: import('@/lib/types').ScheduleData | null;
  loading: boolean;
}

interface PhaseGroup {
  phaseKey: string;
  phaseDisplay: string;
  schedules: ScheduleLeaf[];
}

interface ProductionGroup {
  productionKey: string;
  productionDisplay: string;
  phases: PhaseGroup[];
  totalCount: number;
}

function canonicalDisplay(items: { val: string; savedAt: number }[], fallbackKey: string): string {
  if (!items.length) return fallbackKey;
  return [...items].sort((a, b) => b.savedAt - a.savedAt)[0].val;
}

function buildTree(schedules: ScheduleLeaf[]): {
  productions: ProductionGroup[];
  ungrouped: ScheduleLeaf[];
} {
  type ProdEntry = {
    display: { val: string; savedAt: number }[];
    phaseMap: Map<string, { display: { val: string; savedAt: number }[]; leaves: ScheduleLeaf[] }>;
  };
  const prodMap = new Map<string, ProdEntry>();
  const ungrouped: ScheduleLeaf[] = [];

  for (const s of schedules) {
    const proj = (s.data?.meta?.projectName ?? '').trim();
    if (!proj) { ungrouped.push(s); continue; }

    const projKey  = proj.toLowerCase();
    const phase    = (s.data?.meta?.phase ?? '').trim();
    const phaseKey = phase.toLowerCase();
    const savedAt  = s.data?.savedAt ?? 0;

    if (!prodMap.has(projKey)) {
      prodMap.set(projKey, { display: [], phaseMap: new Map() });
    }
    const prod = prodMap.get(projKey)!;
    prod.display.push({ val: proj, savedAt });

    if (!prod.phaseMap.has(phaseKey)) {
      prod.phaseMap.set(phaseKey, { display: [], leaves: [] });
    }
    const ph = prod.phaseMap.get(phaseKey)!;
    if (phase) ph.display.push({ val: phase, savedAt });
    ph.leaves.push(s);
  }

  const productions: ProductionGroup[] = [];
  for (const [prodKey, prodData] of prodMap) {
    const phases: PhaseGroup[] = [];
    for (const [phaseKey, phaseData] of prodData.phaseMap) {
      const sorted = [...phaseData.leaves].sort((a, b) => {
        const da = a.data?.meta?.dayNumber ?? Infinity;
        const db = b.data?.meta?.dayNumber ?? Infinity;
        if (da !== db) return da - db;
        return (b.data?.savedAt ?? 0) - (a.data?.savedAt ?? 0);
      });
      const phaseDisplay = phaseKey
        ? canonicalDisplay(phaseData.display, phaseKey)
        : '';
      phases.push({ phaseKey, phaseDisplay, schedules: sorted });
    }
    phases.sort((a, b) => {
      if (!a.phaseKey && b.phaseKey) return 1;
      if (a.phaseKey && !b.phaseKey) return -1;
      return a.phaseKey.localeCompare(b.phaseKey);
    });

    const productionDisplay = canonicalDisplay(prodData.display, prodKey);
    const totalCount = phases.reduce((n, ph) => n + ph.schedules.length, 0);
    productions.push({ productionKey: prodKey, productionDisplay, phases, totalCount });
  }

  productions.sort((a, b) => a.productionKey.localeCompare(b.productionKey));
  ungrouped.sort((a, b) => (b.data?.savedAt ?? 0) - (a.data?.savedAt ?? 0));

  return { productions, ungrouped };
}

// Apply manual phaseOrder; items not in the order array fall back to dayNumber/savedAt sort.
function applyPhaseOrder(schedules: ScheduleLeaf[], order: string[] | undefined): ScheduleLeaf[] {
  if (!order || order.length === 0) return schedules;
  const orderMap = new Map(order.map((name, i) => [name, i]));
  return [...schedules].sort((a, b) => {
    const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : Infinity;
    const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : Infinity;
    if (ia !== ib) return ia - ib;
    const da = a.data?.meta?.dayNumber ?? Infinity;
    const db = b.data?.meta?.dayNumber ?? Infinity;
    if (da !== db) return da - db;
    return (b.data?.savedAt ?? 0) - (a.data?.savedAt ?? 0);
  });
}

// ── Meta line ─────────────────────────────────────────────────────────────────

function formatMeta(s: ScheduleLeaf): string {
  if (s.loading || !s.data) return '';
  const town = s.data.meta?.town ? s.data.meta.town.split(',')[0].trim() : '';
  const dateStr = s.data.meta?.date
    ? new Date(s.data.meta.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';
  return [town, dateStr].filter(Boolean).join(' · ');
}

// ── Schedule row content (rendered inside Draggable's div) ────────────────────

interface RowContentProps {
  s: ScheduleLeaf;
  isArchived: boolean;
  syncingNames: Set<string>;
  copiedInfo: { name: string; kind: 'team' | 'client' } | null;
  onCopyTeam: (name: string) => void;
  onCopyClient: (name: string) => void;
  onArchive: (name: string) => void;
  onRestore: (name: string) => void;
  onDeletePermanently: (name: string) => void;
  onRename: (name: string) => void;
  onMoveTo: (name: string) => void;
  onOpen: (name: string) => void;
}

function ScheduleRowContent({
  s, isArchived, syncingNames, copiedInfo,
  onCopyTeam, onCopyClient,
  onArchive, onRestore, onDeletePermanently, onRename, onMoveTo, onOpen,
}: RowContentProps) {
  const meta = formatMeta(s);
  const isSyncing = syncingNames.has(s.name);

  // Links dropdown state — portal-based to escape overflow:hidden on .lbt-prod / .lbt-ungrouped
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const wrapRef  = useRef<HTMLDivElement>(null);
  const menuRef  = useRef<HTMLDivElement>(null);

  function toggleMenu() {
    if (menuOpen) { setMenuOpen(false); return; }
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      // Right-align the dropdown with the trigger, anchored to viewport (position:fixed)
      setMenuStyle({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    function onScroll() { setMenuOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menuOpen]);

  const anyCopied = copiedInfo?.name === s.name;

  return (
    <>
      <button
        className="lbt-sched-name"
        onClick={() => onOpen(s.name)}
        title={isSyncing ? 'Still syncing — please wait a moment' : s.name}
      >
        {isArchived && <span className="lbt-archived-glyph">⊘ </span>}
        {s.name}
      </button>
      {s.loading ? (
        <span className="lbt-sched-loading">Loading…</span>
      ) : (
        <span className="lbt-sched-meta">{meta}</span>
      )}
      <div className="lbt-sched-acts" onClick={(e) => e.stopPropagation()}>

        {/* ── Links dropdown — replaces separate Team Link / Client Link buttons ── */}
        <div
          ref={wrapRef}
          className={`sitem-links-wrap${isArchived ? ' lib-acts-desktop-only' : ''}`}
        >
          <button
            className="sitem-links-btn"
            onClick={toggleMenu}
            title="Copy schedule links"
          >
            {anyCopied ? '✓ Copied' : 'Links'}
          </button>
          {menuOpen && createPortal(
            <div ref={menuRef} className="sitem-links-menu" style={menuStyle}>
              <button
                className="sitem-links-item"
                onClick={() => { onCopyTeam(s.name); setMenuOpen(false); }}
              >
                Copy Team Link
              </button>
              <button
                className="sitem-links-item"
                onClick={() => { onCopyClient(s.name); setMenuOpen(false); }}
              >
                Copy Client Link
              </button>
            </div>,
            document.body
          )}
        </div>

        {isArchived ? (
          <>
            {/* Restore: shows "Restore" on desktop, ↺ on mobile */}
            <button
              className="sitem-restore-btn"
              onClick={() => onRestore(s.name)}
              title="Restore from archive"
            >
              <span className="lib-btn-desktop">Restore</span>
              <span className="lib-btn-mobile">↺</span>
            </button>
            {/* Delete permanently: shows "Delete" on desktop, 🗑 on mobile */}
            <button
              className="sitem-del"
              onClick={() => onDeletePermanently(s.name)}
              title="Delete permanently"
            >
              <span className="lib-btn-desktop">Delete</span>
              <span className="lib-btn-mobile">🗑</span>
            </button>
          </>
        ) : (
          <>
            {/* Move To: active schedules only, desktop only; disabled during post-rename CDN sync window */}
            <button
              className="sitem-move-btn lib-acts-desktop-only"
              onClick={() => !isSyncing && onMoveTo(s.name)}
              disabled={isSyncing}
              title={isSyncing ? 'Still syncing — please wait a moment' : 'Move to another production or phase'}
            >
              Move To
            </button>
            {/* Rename: active schedules only; disabled during post-rename CDN sync window */}
            <button
              className="sitem-rename-btn lib-acts-desktop-only"
              onClick={() => !isSyncing && onRename(s.name)}
              disabled={isSyncing}
              title={isSyncing ? 'Still syncing — please wait a moment' : 'Rename schedule'}
            >
              {isSyncing ? 'Syncing…' : 'Rename'}
            </button>
            {/* Archive: shows "Archive" on desktop, 🗑 on mobile */}
            <button
              className="sitem-del"
              onClick={() => onArchive(s.name)}
              title="Archive schedule"
            >
              <span className="lib-btn-desktop">Archive</span>
              <span className="lib-btn-mobile">🗑</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ── Edit modal state ──────────────────────────────────────────────────────────

interface EditModal {
  type: 'production' | 'phase';
  productionKey: string;
  phaseKey?: string;
  draft: string;
  saving: boolean;
  error: string | null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  schedules: LibrarySchedule[];
  libMeta: LibraryData;
  onArchive: (name: string) => void;
  onRestore: (name: string) => void;
  onDeletePermanently: (name: string) => void;
  onRename: (name: string) => void;
  onMoveTo: (name: string) => void;
  onUpdateLibMeta: (updated: LibraryData) => Promise<void>;
  syncingNames?: Set<string>;
}

export default function LibraryTree({
  schedules, libMeta,
  onArchive, onRestore, onDeletePermanently, onRename, onMoveTo,
  onUpdateLibMeta, syncingNames: syncingNamesProp,
}: Props) {
  const syncingNames = syncingNamesProp ?? EMPTY_SET;
  const router = useRouter();
  const [collapsed,        setCollapsed]        = useState<Set<string>>(new Set());
  const [copiedInfo,       setCopiedInfo]        = useState<{ name: string; kind: 'team' | 'client' } | null>(null);
  const [editModal,        setEditModal]         = useState<EditModal | null>(null);
  const [dndMessage,       setDndMessage]        = useState<string | null>(null);
  const [creatingProd,     setCreatingProd]      = useState(false);
  const [newProdDraft,     setNewProdDraft]      = useState('');
  const [creatingPhaseFor, setCreatingPhaseFor]  = useState<string | null>(null);
  const [newPhaseDraft,    setNewPhaseDraft]     = useState('');
  // UI-only ephemeral empty containers (cleared on page reload — by design)
  const [emptyProds,  setEmptyProds]  = useState<Map<string, string>>(new Map());
  const [emptyPhases, setEmptyPhases] = useState<Map<string, Map<string, string>>>(new Map());

  useEffect(() => { setCollapsed(loadCollapsed()); }, []);

  useEffect(() => {
    if (!dndMessage) return;
    const t = setTimeout(() => setDndMessage(null), 4000);
    return () => clearTimeout(t);
  }, [dndMessage]);

  // Index for recent write lookups
  const scheduleMap = useMemo(() => new Map(schedules.map((s) => [s.name, s])), [schedules]);

  // ── Collapse ────────────────────────────────────────────────────────────────

  function toggleNode(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  function expandNode(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveCollapsed(next);
      return next;
    });
  }

  // ── Copy links ──────────────────────────────────────────────────────────────

  function copyLink(name: string, url: string, kind: 'team' | 'client') {
    navigator.clipboard.writeText(url).catch(() => prompt(`Copy ${kind} link:`, url));
    setCopiedInfo({ name, kind });
    setTimeout(() => setCopiedInfo((c) => c?.name === name && c?.kind === kind ? null : c), 3000);
  }

  const rowProps: Omit<RowContentProps, 's' | 'isArchived'> = {
    syncingNames,
    copiedInfo,
    onCopyTeam:   (name) => copyLink(name, `${window.location.origin}/schedule/${encodeURIComponent(name)}?auth=true`, 'team'),
    onCopyClient: (name) => copyLink(name, `${window.location.origin}/view/${encodeURIComponent(name)}`, 'client'),
    onArchive,
    onRestore,
    onDeletePermanently,
    onRename,
    onMoveTo,
    onOpen: (name) => {
      if (syncingNames.has(name)) {
        setDndMessage('Still syncing — please wait a few seconds before opening.');
        return;
      }
      writeRecent(name, scheduleMap.get(name), libMeta);
      router.push(`/schedule/${encodeURIComponent(name)}`);
    },
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  function handleDragStart(start: DragStart) {
    console.log('[DnD] drag started', {
      draggableId: start.draggableId,
      source: start.source.droppableId,
      sourceIndex: start.source.index,
    });
  }

  async function handleDragEnd(result: DropResult) {
    const { source, destination } = result;
    console.log('[DnD] dropped', {
      draggableId: result.draggableId,
      source: source?.droppableId,
      sourceIndex: source?.index,
      destination: destination?.droppableId ?? null,
      destinationIndex: destination?.index ?? null,
    });

    if (!destination) {
      console.log('[DnD] dropped outside droppable — no-op');
      return;
    }

    if (source.droppableId !== destination.droppableId) {
      console.log('[DnD] cross-section move rejected — source:', source.droppableId, '→ dest:', destination.droppableId);
      setDndMessage('Moving between sections is not supported yet.');
      return;
    }

    if (source.index === destination.index) {
      console.log('[DnD] same position — no-op');
      return;
    }

    // droppableId = "phase:<productionKey>:<phaseKey>"
    const withoutPrefix = destination.droppableId.slice('phase:'.length);
    const colonIdx = withoutPrefix.indexOf(':');
    const productionKey = withoutPrefix.slice(0, colonIdx);
    const phaseKey      = withoutPrefix.slice(colonIdx + 1);

    console.log('[DnD] same-section reorder — productionKey:', productionKey, 'phaseKey:', phaseKey);

    const { productions } = buildTree(schedules);
    const prod  = productions.find((p) => p.productionKey === productionKey);
    const phase = prod?.phases.find((p) => p.phaseKey === phaseKey);
    if (!phase) return;

    const orderedNames = applyPhaseOrder(
      phase.schedules,
      libMeta.phaseOrder?.[productionKey]?.[phaseKey]
    ).map((s) => s.name);

    console.log('[DnD] phaseOrder before:', orderedNames);

    const newOrder = [...orderedNames];
    const [removed] = newOrder.splice(source.index, 1);
    newOrder.splice(destination.index, 0, removed);

    console.log('[DnD] phaseOrder after:', newOrder);

    try {
      await onUpdateLibMeta({
        ...libMeta,
        phaseOrder: {
          ...(libMeta.phaseOrder ?? {}),
          [productionKey]: {
            ...(libMeta.phaseOrder?.[productionKey] ?? {}),
            [phaseKey]: newOrder,
          },
        },
        updatedAt: Date.now(),
      });
      console.log('[DnD] phaseOrder save confirmed — state persisted');
    } catch {
      // onUpdateLibMeta (updateLibMeta in LibraryPage) already reverted libMeta
      // and surfaced the error via the refresh-error banner.
      console.log('[DnD] phaseOrder save failed — state reverted to previous order');
    }
  }

  // ── Inline create ───────────────────────────────────────────────────────────

  function confirmCreateProd() {
    const name = titleCase(newProdDraft);
    if (!name) { setCreatingProd(false); return; }
    const key = name.toLowerCase();
    setEmptyProds((prev) => new Map(prev).set(key, name));
    setCreatingProd(false);
    setNewProdDraft('');
    expandNode(`prod:${key}`);
  }

  function confirmCreatePhase(productionKey: string) {
    const name = titleCase(newPhaseDraft);
    if (!name) { setCreatingPhaseFor(null); return; }
    const key = name.toLowerCase();
    setEmptyPhases((prev) => {
      const next = new Map(prev);
      const phases = new Map(next.get(productionKey) ?? []);
      phases.set(key, name);
      next.set(productionKey, phases);
      return next;
    });
    setCreatingPhaseFor(null);
    setNewPhaseDraft('');
    expandNode(`phase:${productionKey}:${key}`);
  }

  // ── Contextual new schedule ─────────────────────────────────────────────────

  function handleNewSchedule(projectName: string, phase: string) {
    const params = new URLSearchParams();
    if (projectName) params.set('proj', projectName);
    if (phase)       params.set('ph', phase);
    router.push(`/schedule/Untitled?${params.toString()}`);
  }

  // ── Edit modal ──────────────────────────────────────────────────────────────

  function openEditProd(prod: ProductionGroup) {
    setEditModal({
      type: 'production',
      productionKey: prod.productionKey,
      draft: prod.productionDisplay,
      saving: false,
      error: null,
    });
  }

  function openEditPhase(prod: ProductionGroup, ph: PhaseGroup) {
    setEditModal({
      type: 'phase',
      productionKey: prod.productionKey,
      phaseKey: ph.phaseKey,
      draft: ph.phaseDisplay,
      saving: false,
      error: null,
    });
  }

  async function handleEditSave() {
    if (!editModal) return;
    const newName = titleCase(editModal.draft);
    if (!newName) return;
    setEditModal((m) => m ? { ...m, saving: true, error: null } : null);
    try {
      let updatedMeta: LibraryData;
      if (editModal.type === 'production') {
        updatedMeta = {
          ...libMeta,
          productionDisplayNames: {
            ...(libMeta.productionDisplayNames ?? {}),
            [editModal.productionKey]: newName,
          },
          updatedAt: Date.now(),
        };
      } else {
        updatedMeta = {
          ...libMeta,
          phaseDisplayNames: {
            ...(libMeta.phaseDisplayNames ?? {}),
            [editModal.productionKey]: {
              ...(libMeta.phaseDisplayNames?.[editModal.productionKey] ?? {}),
              [editModal.phaseKey!]: newName,
            },
          },
          updatedAt: Date.now(),
        };
      }
      await onUpdateLibMeta(updatedMeta);
      setEditModal(null);
    } catch (err) {
      setEditModal((m) => m ? { ...m, saving: false, error: (err as Error).message || 'Save failed.' } : null);
    }
  }

  // ── Build the display tree ──────────────────────────────────────────────────

  const { productions: schedProductions, ungrouped } = buildTree(schedules);

  // Apply display name overrides from libMeta
  const overriddenProductions = schedProductions.map((prod) => ({
    ...prod,
    productionDisplay: libMeta.productionDisplayNames?.[prod.productionKey] ?? prod.productionDisplay,
    phases: prod.phases.map((ph) => ({
      ...ph,
      phaseDisplay: ph.phaseKey
        ? (libMeta.phaseDisplayNames?.[prod.productionKey]?.[ph.phaseKey] ?? ph.phaseDisplay)
        : ph.phaseDisplay,
    })),
  }));

  // Merge UI-only empty productions
  const allProductions = [...overriddenProductions];
  for (const [prodKey, prodDisplay] of emptyProds) {
    if (!allProductions.some((p) => p.productionKey === prodKey)) {
      allProductions.push({ productionKey: prodKey, productionDisplay: prodDisplay, phases: [], totalCount: 0 });
    }
  }
  allProductions.sort((a, b) => a.productionKey.localeCompare(b.productionKey));

  // Merge UI-only empty phases into each production
  for (const prod of allProductions) {
    const epMap = emptyPhases.get(prod.productionKey);
    if (epMap) {
      for (const [phKey, phDisplay] of epMap) {
        if (!prod.phases.some((ph) => ph.phaseKey === phKey)) {
          prod.phases.push({ phaseKey: phKey, phaseDisplay: phDisplay, schedules: [] });
          prod.phases.sort((a, b) => {
            if (!a.phaseKey && b.phaseKey) return 1;
            if (a.phaseKey && !b.phaseKey) return -1;
            return a.phaseKey.localeCompare(b.phaseKey);
          });
        }
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Edit modal */}
      {editModal && (
        <div
          className="lbt-modal-overlay"
          onClick={() => !editModal.saving && setEditModal(null)}
        >
          <div className="lbt-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="lbt-modal-title">
              {editModal.type === 'production' ? 'Edit Production' : 'Edit Phase'}
            </h2>
            <div className="lbt-modal-label">Name</div>
            <input
              className="lbt-modal-input"
              autoFocus
              value={editModal.draft}
              onChange={(e) => setEditModal((m) => m ? { ...m, draft: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !editModal.saving) handleEditSave();
                if (e.key === 'Escape' && !editModal.saving) setEditModal(null);
              }}
              disabled={editModal.saving}
            />
            {editModal.error && <p className="lbt-modal-error">{editModal.error}</p>}
            <div className="lbt-modal-actions">
              <button
                className="btn btn-light btn-sm"
                onClick={() => setEditModal(null)}
                disabled={editModal.saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-pink btn-sm"
                onClick={handleEditSave}
                disabled={editModal.saving || !editModal.draft.trim()}
              >
                {editModal.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dndMessage && (
        <div className="lib-refresh-error" role="alert">
          {dndMessage}
          <button className="lib-refresh-error-dismiss" onClick={() => setDndMessage(null)}>✕</button>
        </div>
      )}

      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="lbt-tree">
          {/* Empty state */}
          {allProductions.length === 0 && ungrouped.length === 0 && !creatingProd && (
            <div className="lbt-empty-state">
              <strong>No schedules yet.</strong><br />
              Create a new schedule, then save it to keep it here.
            </div>
          )}

          {allProductions.map((prod) => {
            const prodId        = `prod:${prod.productionKey}`;
            const prodCollapsed = collapsed.has(prodId);
            const nophaseGroup  = prod.phases.find((ph) => ph.phaseKey === '');
            const namedPhases   = prod.phases.filter((ph) => ph.phaseKey !== '');

            return (
              <div key={prodId} className="lbt-prod">
                {/* Production header */}
                <div className="lbt-prod-row" onClick={() => toggleNode(prodId)}>
                  <span className="lbt-prod-chevron">{prodCollapsed ? '▶' : '▼'}</span>
                  <span className="lbt-prod-name">{prod.productionDisplay}</span>
                  <span className="lbt-prod-count">
                    {prod.totalCount} schedule{prod.totalCount === 1 ? '' : 's'}
                  </span>
                  <button
                    className="lbt-edit-btn"
                    onClick={(e) => { e.stopPropagation(); openEditProd(prod); }}
                    title="Rename production"
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                {/* Production body */}
                {!prodCollapsed && (
                  <>
                    {/* Named phase groups */}
                    {namedPhases.map((ph) => {
                      const phaseId        = `phase:${prod.productionKey}:${ph.phaseKey}`;
                      const phaseCollapsed = collapsed.has(phaseId);
                      const ordered        = applyPhaseOrder(
                        ph.schedules,
                        libMeta.phaseOrder?.[prod.productionKey]?.[ph.phaseKey]
                      );

                      return (
                        <div key={phaseId} className="lbt-phase">
                          {/* Phase header */}
                          <div className="lbt-phase-row" onClick={() => toggleNode(phaseId)}>
                            <span className="lbt-phase-chevron">{phaseCollapsed ? '▶' : '▼'}</span>
                            <span className="lbt-phase-name">{ph.phaseDisplay}</span>
                            <span className="lbt-phase-count">
                              {ph.schedules.length} schedule{ph.schedules.length === 1 ? '' : 's'}
                            </span>
                            <button
                              className="lbt-edit-btn"
                              onClick={(e) => { e.stopPropagation(); openEditPhase(prod, ph); }}
                              title="Rename phase"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>

                          {!phaseCollapsed && (
                            <>
                              <Droppable droppableId={phaseId}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="lbt-sched-list"
                                  >
                                    {ordered.map((s, i) => {
                                      const isArchived = libMeta.tsarchived?.includes(s.name) ?? false;
                                      return (
                                        <Draggable key={s.name} draggableId={s.name} index={i}>
                                          {(provided, snapshot) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.draggableProps}
                                              className={`lbt-sched-row${snapshot.isDragging ? ' is-dragging' : ''}${isArchived ? ' lbt-sched-row--archived' : ''}`}
                                            >
                                              <span
                                                className="lbt-drag-handle"
                                                {...(provided.dragHandleProps ?? {})}
                                              >
                                                <GripVertical size={16} />
                                              </span>
                                              <ScheduleRowContent
                                                s={s}
                                                isArchived={isArchived}
                                                {...rowProps}
                                              />
                                            </div>
                                          )}
                                        </Draggable>
                                      );
                                    })}
                                    {provided.placeholder}
                                  </div>
                                )}
                              </Droppable>

                              {/* Contextual + New Schedule */}
                              <button
                                className="lbt-new-sched-btn"
                                onClick={() => handleNewSchedule(prod.productionDisplay, ph.phaseDisplay)}
                              >
                                + New Schedule
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Phase — inline create or button */}
                    {creatingPhaseFor === prod.productionKey ? (
                      <div className="lbt-inline-create lbt-inline-create--phase">
                        <input
                          className="lbt-create-input"
                          autoFocus
                          value={newPhaseDraft}
                          placeholder="Phase name…"
                          onChange={(e) => setNewPhaseDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmCreatePhase(prod.productionKey);
                            if (e.key === 'Escape') { setCreatingPhaseFor(null); setNewPhaseDraft(''); }
                          }}
                        />
                        <button className="lbt-create-confirm" onClick={() => confirmCreatePhase(prod.productionKey)}>✓</button>
                        <button className="lbt-create-cancel" onClick={() => { setCreatingPhaseFor(null); setNewPhaseDraft(''); }}>✕</button>
                      </div>
                    ) : (
                      <button
                        className="lbt-add-phase-btn"
                        onClick={() => { setCreatingPhaseFor(prod.productionKey); setNewPhaseDraft(''); }}
                      >
                        + Add Phase
                      </button>
                    )}

                    {/* Unphased schedules directly under production */}
                    {nophaseGroup && (
                      <div className="lbt-prod-direct">
                        <Droppable droppableId={`phase:${prod.productionKey}:`}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className="lbt-sched-list"
                            >
                              {applyPhaseOrder(
                                nophaseGroup.schedules,
                                libMeta.phaseOrder?.[prod.productionKey]?.['']
                              ).map((s, i) => {
                                const isArchived = libMeta.tsarchived?.includes(s.name) ?? false;
                                return (
                                  <Draggable key={s.name} draggableId={s.name} index={i}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`lbt-sched-row${snapshot.isDragging ? ' is-dragging' : ''}${isArchived ? ' lbt-sched-row--archived' : ''}`}
                                      >
                                        <span
                                          className="lbt-drag-handle"
                                          {...(provided.dragHandleProps ?? {})}
                                        >
                                          <GripVertical size={16} />
                                        </span>
                                        <ScheduleRowContent
                                          s={s}
                                          isArchived={isArchived}
                                          {...rowProps}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* + Add Production */}
          {creatingProd ? (
            <div className="lbt-inline-create">
              <input
                className="lbt-create-input"
                autoFocus
                value={newProdDraft}
                placeholder="Production name…"
                onChange={(e) => setNewProdDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreateProd();
                  if (e.key === 'Escape') { setCreatingProd(false); setNewProdDraft(''); }
                }}
              />
              <button className="lbt-create-confirm" onClick={confirmCreateProd}>✓</button>
              <button className="lbt-create-cancel" onClick={() => { setCreatingProd(false); setNewProdDraft(''); }}>✕</button>
            </div>
          ) : (
            <button
              className="lbt-add-prod-btn"
              onClick={() => { setCreatingProd(true); setNewProdDraft(''); }}
            >
              + Add Production
            </button>
          )}

          {/* Ungrouped schedules — no DnD */}
          {ungrouped.length > 0 && (
            <div className="lbt-ungrouped">
              <div className="lbt-ungrouped-hdr">
                <span className="lbt-ungrouped-name">Ungrouped</span>
                <span className="lbt-ungrouped-count">
                  {ungrouped.length} schedule{ungrouped.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="lbt-sched-list">
                {ungrouped.map((s) => {
                  const isArchived = libMeta.tsarchived?.includes(s.name) ?? false;
                  return (
                    <div
                      key={s.name}
                      className={`lbt-sched-row${isArchived ? ' lbt-sched-row--archived' : ''}`}
                    >
                      <span className="lbt-drag-handle lbt-drag-handle--inert">
                        <GripVertical size={16} />
                      </span>
                      <ScheduleRowContent s={s} isArchived={isArchived} {...rowProps} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DragDropContext>
    </>
  );
}
