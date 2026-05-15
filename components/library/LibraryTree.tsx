'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { LibrarySchedule } from './ScheduleListTab';

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
  phaseKey: string;      // '' for schedules with no phase
  phaseDisplay: string;
  schedules: ScheduleLeaf[];
}

interface ProductionGroup {
  productionKey: string;
  productionDisplay: string;
  phases: PhaseGroup[];  // includes phaseKey='' group for unphased schedules
  totalCount: number;
}

// Pick canonical display name from the most recently saved occurrence
function canonicalDisplay(items: { val: string; savedAt: number }[], fallbackKey: string): string {
  if (!items.length) return fallbackKey;
  return [...items].sort((a, b) => b.savedAt - a.savedAt)[0].val;
}

function buildTree(schedules: LibrarySchedule[]): {
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
    // Named phases alphabetically; no-phase group last
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

// ── Schedule row ──────────────────────────────────────────────────────────────

function formatMeta(s: ScheduleLeaf): string {
  if (s.loading) return '';
  if (!s.data) return '';
  const town = s.data.meta?.town ? s.data.meta.town.split(',')[0].trim() : '';
  const dateStr = s.data.meta?.date
    ? new Date(s.data.meta.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';
  return [town, dateStr].filter(Boolean).join(' · ');
}

interface ScheduleRowProps {
  s: ScheduleLeaf;
  copiedInfo: { name: string; kind: 'team' | 'client' } | null;
  onCopyTeam: (name: string) => void;
  onCopyClient: (name: string) => void;
  onDelete: (name: string) => void;
  onOpen: (name: string) => void;
}

function ScheduleRow({ s, copiedInfo, onCopyTeam, onCopyClient, onDelete, onOpen }: ScheduleRowProps) {
  const meta = formatMeta(s);
  return (
    <div className="lbt-sched-row">
      <button className="lbt-sched-name" onClick={() => onOpen(s.name)} title={s.name}>
        {s.name}
      </button>
      {s.loading ? (
        <span className="lbt-sched-loading">Loading…</span>
      ) : (
        <span className="lbt-sched-meta">{meta}</span>
      )}
      <div className="lbt-sched-acts" onClick={(e) => e.stopPropagation()}>
        <button
          className="sitem-copy"
          onClick={() => onCopyTeam(s.name)}
          title="Copy team link (requires PIN)"
        >
          {copiedInfo?.name === s.name && copiedInfo.kind === 'team' ? '✓ Team Link' : 'Team Link'}
        </button>
        <button
          className="sitem-copy sitem-copy-client"
          onClick={() => onCopyClient(s.name)}
          title="Copy public read-only link"
        >
          {copiedInfo?.name === s.name && copiedInfo.kind === 'client' ? '✓ Client Link' : 'Client Link'}
        </button>
        <button className="sitem-del" onClick={() => onDelete(s.name)} title="Delete schedule">
          🗑
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  schedules: LibrarySchedule[];
  onDelete: (name: string) => void;
}

export default function LibraryTree({ schedules, onDelete }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copiedInfo, setCopiedInfo] = useState<{ name: string; kind: 'team' | 'client' } | null>(null);

  useEffect(() => { setCollapsed(loadCollapsed()); }, []);

  function toggleNode(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  function copyLink(name: string, url: string, kind: 'team' | 'client') {
    navigator.clipboard.writeText(url).catch(() => prompt(`Copy ${kind} link:`, url));
    setCopiedInfo({ name, kind });
    setTimeout(() => setCopiedInfo((c) => c?.name === name && c?.kind === kind ? null : c), 3000);
  }

  function copyTeam(name: string) {
    copyLink(name, `${window.location.origin}/schedule/${encodeURIComponent(name)}?auth=true`, 'team');
  }

  function copyClient(name: string) {
    copyLink(name, `${window.location.origin}/view/${encodeURIComponent(name)}`, 'client');
  }

  const { productions, ungrouped } = buildTree(schedules);

  if (schedules.length === 0) {
    return (
      <div className="lbt-empty-state">
        <strong>No schedules yet.</strong><br />
        Create a new schedule, then save it to keep it here.
      </div>
    );
  }

  const rowProps = {
    copiedInfo,
    onCopyTeam: copyTeam,
    onCopyClient: copyClient,
    onDelete,
    onOpen: (name: string) => router.push(`/schedule/${encodeURIComponent(name)}`),
  };

  return (
    <div className="lbt-tree">
      {productions.map((prod) => {
        const prodId       = `prod:${prod.productionKey}`;
        const prodCollapsed = collapsed.has(prodId);

        // Separate unphased leaves from named-phase groups
        const nophaseGroup = prod.phases.find((ph) => ph.phaseKey === '');
        const namedPhases  = prod.phases.filter((ph) => ph.phaseKey !== '');

        return (
          <div key={prodId} className="lbt-prod">
            {/* Production header */}
            <div className="lbt-prod-row" onClick={() => toggleNode(prodId)}>
              <span className="lbt-prod-chevron">{prodCollapsed ? '▶' : '▼'}</span>
              <span className="lbt-prod-name">{prod.productionDisplay}</span>
              <span className="lbt-prod-count">
                {prod.totalCount} schedule{prod.totalCount === 1 ? '' : 's'}
              </span>
            </div>

            {/* Production body */}
            {!prodCollapsed && (
              <>
                {/* Named phase groups */}
                {namedPhases.map((ph) => {
                  const phaseId        = `phase:${prod.productionKey}:${ph.phaseKey}`;
                  const phaseCollapsed = collapsed.has(phaseId);
                  return (
                    <div key={phaseId} className="lbt-phase">
                      <div className="lbt-phase-row" onClick={() => toggleNode(phaseId)}>
                        <span className="lbt-phase-chevron">{phaseCollapsed ? '▶' : '▼'}</span>
                        <span className="lbt-phase-name">{ph.phaseDisplay}</span>
                        <span className="lbt-phase-count">
                          {ph.schedules.length} schedule{ph.schedules.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {!phaseCollapsed && (
                        <div className="lbt-sched-list">
                          {ph.schedules.map((s) => (
                            <ScheduleRow key={s.name} s={s} {...rowProps} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unphased schedules directly under production */}
                {nophaseGroup && (
                  <div className="lbt-prod-direct">
                    <div className="lbt-sched-list">
                      {nophaseGroup.schedules.map((s) => (
                        <ScheduleRow key={s.name} s={s} {...rowProps} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Ungrouped section — hidden when empty */}
      {ungrouped.length > 0 && (
        <div className="lbt-ungrouped">
          <div className="lbt-ungrouped-hdr">
            <span className="lbt-ungrouped-name">Ungrouped</span>
            <span className="lbt-ungrouped-count">
              {ungrouped.length} schedule{ungrouped.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="lbt-sched-list">
            {ungrouped.map((s) => (
              <ScheduleRow key={s.name} s={s} {...rowProps} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
