'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PanelRight, X } from 'lucide-react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useAuthStore } from '@/lib/store/authStore';
import { loadTemplates, saveTemplateRemote, deleteTemplateRemote, migrateTemplates } from '@/lib/api/templates';
import { getTemplates } from '@/lib/templates';
import { LS_TEMPLATES_KEY } from '@/lib/constants';
import { normalizeRows } from '@/lib/rowNormalizer';
import { recalcRows } from '@/lib/time';
import { getSnapshots, deleteSnapshot } from '@/lib/api/snapshots';
import { postSave } from '@/lib/api/save';
import { computeTimeOut } from '@/lib/time';
import type { TemplateMap } from '@/lib/templates';
import type { Snapshot } from '@/lib/types';

// ─── Templates ───────────────────────────────────────────────────────────────

function TemplatesTabPanel() {
  const token        = useAuthStore((s) => s.token);
  const rows         = useScheduleStore((s) => s.rows);
  const meta         = useScheduleStore((s) => s.meta);
  const dirty        = useScheduleStore((s) => s.dirty);
  const scheduleName = useScheduleStore((s) => s.scheduleName);
  const loadSchedule = useScheduleStore((s) => s.loadSchedule);
  const updateMeta   = useScheduleStore((s) => s.updateMeta);

  const [templates, setTemplates]   = useState<TemplateMap>({});
  const [nameInput, setNameInput]   = useState('');
  const [status, setStatus]         = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    loadTemplates(token)
      .then(async (remote) => {
        if (Object.keys(remote).length === 0) {
          const local = getTemplates();
          if (Object.keys(local).length > 0) {
            const migrated = await migrateTemplates(local, token).catch(() => local);
            localStorage.removeItem(LS_TEMPLATES_KEY);
            setTemplates(migrated);
            setStatus('ready');
            return;
          }
        }
        setTemplates(remote);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  async function handleSave() {
    const name = nameInput.trim();
    if (!name || !token) return;
    const updated = await saveTemplateRemote(name, rows, token).catch(() => null);
    if (updated) { setTemplates(updated); setNameInput(''); }
  }

  function handleApply(name: string) {
    const tpl = templates[name];
    if (!tpl) return;
    if (dirty && !confirm(`Apply template "${name}"? Unsaved changes will be lost.`)) return;
    const normalized = normalizeRows(tpl.rows.map((r) => ({ ...r, sunLocked: false })));
    // Reload into current schedule name (no navigation); apply rows while preserving meta.
    // updateMeta({}) after load marks the schedule dirty so the user knows to save.
    loadSchedule(scheduleName ?? 'Untitled', { rows: recalcRows(normalized), meta, savedAt: 0 });
    updateMeta({});
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete template "${name}"?`) || !token) return;
    const updated = await deleteTemplateRemote(name, token).catch(() => null);
    if (updated) setTemplates(updated);
  }

  const keys = Object.keys(templates).sort(
    (a, b) => (templates[b].savedAt ?? 0) - (templates[a].savedAt ?? 0)
  );

  return (
    <>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
        <input
          className="form-input"
          type="text"
          placeholder="Template name…"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ flex: '1 1 160px', minHeight: '34px', fontSize: '13px' }}
        />
        <button
          className="btn btn-pink btn-sm"
          onClick={handleSave}
          disabled={!nameInput.trim() || status !== 'ready'}
        >
          + Save as Template
        </button>
      </div>

      {status === 'loading' && <div className="empty">Loading templates…</div>}
      {status === 'error'   && <div className="empty">Could not load templates — check your connection.</div>}
      {status === 'ready' && keys.length === 0 && (
        <div className="empty">
          <strong>No templates yet.</strong><br />
          Build a schedule, then save it as a template to reuse it.
        </div>
      )}
      {status === 'ready' && keys.length > 0 && (
        <div className="slist">
          {keys.map((name) => {
            const tpl = templates[name];
            const cnt = (tpl.rows ?? []).filter((r) => r.action).length;
            return (
              <div key={name} className="sitem" onClick={() => handleApply(name)}>
                <div className="sitem-info">
                  <div className="sitem-name">★ {name}</div>
                  <div className="sitem-meta">{cnt} action{cnt === 1 ? '' : 's'} · tap to apply</div>
                </div>
                <div className="sitem-acts" onClick={(e) => e.stopPropagation()}>
                  <button className="sitem-del" onClick={() => handleDelete(name)} title="Delete template">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Backup ──────────────────────────────────────────────────────────────────

function BackupTabPanel() {
  const scheduleName    = useScheduleStore((s) => s.scheduleName);
  const getScheduleData = useScheduleStore((s) => s.getScheduleData);

  function handleExport() {
    const data  = getScheduleData();
    const today = new Date().toISOString().slice(0, 10);
    const name  = scheduleName ?? 'schedule';
    const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `${name}-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="tp-backup-desc">
        Download the current schedule as a JSON file.
        Filename includes today&rsquo;s date for easy versioning.
      </p>
      <button className="btn btn-light btn-sm" onClick={handleExport}>
        Export JSON
      </button>
    </div>
  );
}

// ─── Restore ─────────────────────────────────────────────────────────────────

function RestoreTabPanel() {
  const token            = useAuthStore((s) => s.token);
  const scheduleName     = useScheduleStore((s) => s.scheduleName);
  const loadSchedule     = useScheduleStore((s) => s.loadSchedule);
  const setRemoteBaseline = useScheduleStore((s) => s.setRemoteBaseline);
  const setSyncStatus    = useScheduleStore((s) => s.setSyncStatus);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState<Snapshot | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!scheduleName || !token) return;
    setLoading(true);
    setSnapshots([]);
    getSnapshots(scheduleName, token)
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [scheduleName, token]);

  async function handleRestore(snap: Snapshot) {
    if (!token || !scheduleName) return;
    if (!confirm(`Restore this snapshot? The current schedule will be overwritten.`)) return;
    try {
      const result = await postSave(scheduleName, snap.data, token, { force: true });
      loadSchedule(scheduleName, { ...snap.data, savedAt: result.savedAt });
      setRemoteBaseline(result.savedAt, '');
      setSyncStatus('synced');
      setSuccessMsg('Snapshot restored.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      alert('Restore failed — check your connection and try again.');
    }
  }

  async function handleSaveAsNew(snap: Snapshot) {
    if (!token) return;
    const newName = prompt('Save as new schedule — enter a name:', `${scheduleName} copy`)?.trim();
    if (!newName) return;
    try {
      await postSave(newName, snap.data, token, {});
      // Navigate to the new schedule (standard behavior)
      window.location.href = `/schedule/${encodeURIComponent(newName)}`;
    } catch {
      alert('Save failed — check your connection and try again.');
    }
  }

  async function handleDelete(snap: Snapshot) {
    if (!token || !scheduleName) return;
    if (!confirm('Delete this snapshot?\n\nThe saved schedule will not be affected.')) return;
    try {
      await deleteSnapshot(scheduleName, snap.id, token);
      setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
    } catch {
      alert('Delete failed.');
    }
  }

  return (
    <>
      <div className="tp-restore-schedule">
        Showing snapshots for: <strong>{scheduleName ?? '—'}</strong>
      </div>

      {successMsg && <div className="tp-restore-success">{successMsg}</div>}

      {loading && <div className="ver-empty">Loading snapshots…</div>}

      {!loading && snapshots.length === 0 && scheduleName && (
        <div className="ver-empty">
          No snapshots yet. Use <b>Snapshot</b> in the toolbar to save a restore point.
        </div>
      )}

      {!loading && scheduleName && (
        <div className="tp-snap-cap">
          {snapshots.length} / 10 snapshots
          {snapshots.length >= 10 && (
            <span className="tp-snap-cap-note"> · New snapshots replace the oldest.</span>
          )}
        </div>
      )}

      {!loading && snapshots.length > 0 && (
        <div>
          {snapshots.map((snap) => {
            const time = new Date(snap.savedAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            });
            const actCount = (snap.data?.rows ?? []).filter((r) => r.action && !r.sunLocked).length;
            return (
              <div key={snap.id} className="tp-snap-card">
                <div className="tp-snap-top">
                  <span className="tp-snap-time">{time}</span>
                  <span className="snapshot-badge">{snap.label || 'Snapshot'}</span>
                </div>
                <div className="tp-snap-bottom">
                  <span className="tp-snap-count">{actCount} action{actCount === 1 ? '' : 's'}</span>
                  <div className="tp-snap-acts">
                    <button className="btn btn-light btn-sm" onClick={() => setPreview(snap)}>Preview</button>
                    <button className="btn btn-light btn-sm" onClick={() => handleSaveAsNew(snap)}>Save As New</button>
                    <button className="btn btn-pink btn-sm"  onClick={() => handleRestore(snap)}>Restore</button>
                    <button className="tp-snap-del"          onClick={() => handleDelete(snap)}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <div
          className="snapshot-preview-overlay"
          style={{ zIndex: 10002 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}
        >
          <div className="snapshot-preview-modal" role="dialog" aria-modal>
            <div className="snapshot-preview-head">
              <div>
                <div className="snapshot-preview-title">Snapshot Preview</div>
                <div className="snapshot-preview-sub">
                  {scheduleName} · {preview.label || 'Snapshot'} · {new Date(preview.savedAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-light btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="snapshot-preview-body">
              <div className="snapshot-preview-meta">
                <div><b>Schedule</b>{scheduleName}</div>
                <div><b>Date</b>{preview.data?.meta?.date || '—'}</div>
                <div><b>Town / Location</b>{preview.data?.meta?.town || '—'}</div>
              </div>
              {(() => {
                const rows = (preview.data?.rows ?? []).filter(
                  (r) => !r.sunLocked && (r.action || r.notes || r.loc || r.desc)
                );
                return rows.length === 0 ? (
                  <div className="snapshot-preview-empty">This snapshot has no visible rows.</div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table className="snapshot-preview-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Action</th><th>Location</th>
                          <th>Description</th><th>Notes</th>
                          <th>Time In</th><th>Duration</th><th>Time Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{r.action === 'Other' ? r.otherText || 'Other' : r.action}</td>
                            <td>{r.loc}</td>
                            <td>{r.desc}</td>
                            <td>{r.notes}</td>
                            <td>{r.timeIn}</td>
                            <td>{r.dur}</td>
                            <td>{computeTimeOut(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <div className="ver-acts" style={{ justifyContent: 'flex-start', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                <button className="btn btn-light btn-sm" onClick={() => handleSaveAsNew(preview)}>Save As New</button>
                <button className="btn btn-pink btn-sm" onClick={() => { handleRestore(preview); setPreview(null); }}>Restore</button>
                <button className="btn btn-light btn-sm" onClick={() => setPreview(null)}>Close Preview</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

type Tab = 'templates' | 'backup' | 'restore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ToolsPanel({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab]         = useState<Tab>('templates');

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="tp-backdrop" onClick={onClose} />
      <div className="tp-panel" role="dialog" aria-label="Tools">
        <div className="tp-header">
          <div className="tp-title">
            <PanelRight size={16} aria-hidden />
            Tools
          </div>
          <button className="tp-x" onClick={onClose} aria-label="Close tools panel">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="tp-tabs-wrap">
          <div className="mtabs">
            <button className={`mtab${tab === 'templates' ? ' active' : ''}`} onClick={() => setTab('templates')}>Templates</button>
            <button className={`mtab${tab === 'backup'    ? ' active' : ''}`} onClick={() => setTab('backup')}>Backup</button>
            <button className={`mtab${tab === 'restore'   ? ' active' : ''}`} onClick={() => setTab('restore')}>Restore</button>
          </div>
        </div>
        <div className="tp-body">
          <div className={`mtab-panel${tab === 'templates' ? ' active' : ''}`}>
            <TemplatesTabPanel />
          </div>
          <div className={`mtab-panel${tab === 'backup' ? ' active' : ''}`}>
            <BackupTabPanel />
          </div>
          <div className={`mtab-panel${tab === 'restore' ? ' active' : ''}`}>
            <RestoreTabPanel />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
