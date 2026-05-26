'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { getSnapshots, deleteSnapshot } from '@/lib/api/snapshots';
import { postSave } from '@/lib/api/save';
import { computeTimeOut } from '@/lib/time';
import type { Snapshot } from '@/lib/types';

interface Props {
  scheduleNames: string[];
  initialName?: string;
}

export default function VersionsTab({ scheduleNames, initialName = '' }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const [selectedName, setSelectedName] = useState(initialName || scheduleNames[0] || '');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (scheduleNames.length > 0 && !selectedName) {
      setSelectedName(scheduleNames[0]);
    }
  }, [scheduleNames, selectedName]);

  useEffect(() => {
    if (!selectedName || !token) return;
    setLoading(true);
    setSnapshots([]);
    getSnapshots(selectedName, token)
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [selectedName, token]);

  async function handleRestore(snap: Snapshot) {
    if (!token || !selectedName) return;
    if (!confirm(`Restore this snapshot as the current "${selectedName}"? This will overwrite the saved schedule.`)) return;
    try {
      await postSave(selectedName, snap.data, token, { force: true });
      router.push(`/schedule/${encodeURIComponent(selectedName)}`);
    } catch {
      alert('Restore failed — check your connection and try again.');
    }
  }

  async function handleSaveAsNew(snap: Snapshot) {
    if (!token) return;
    const newName = prompt('Save as new schedule — enter a name:', `${selectedName} copy`)?.trim();
    if (!newName) return;
    try {
      await postSave(newName, snap.data, token, {});
      router.push(`/schedule/${encodeURIComponent(newName)}`);
    } catch {
      alert('Save failed — check your connection and try again.');
    }
  }

  async function handleDelete(snap: Snapshot) {
    if (!token || !selectedName) return;
    if (!confirm(`Delete this snapshot from "${selectedName}"?\n\nThe saved schedule will not be affected.`)) return;
    try {
      await deleteSnapshot(selectedName, snap.id, token);
      setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
    } catch {
      alert('Delete failed.');
    }
  }

  return (
    <>
      <div className="ver-head">
        <div className="ver-head-copy">
          Browse recent snapshots for any saved schedule. Preview, restore, or delete restore points here.
        </div>
        <div className="ver-schedule-picker-wrap">
          <select
            className="form-input"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            style={{ width: '100%', minHeight: '44px', fontSize: '15px', borderRadius: '10px', padding: '9px 12px' }}
          >
            {scheduleNames.length === 0 && <option value="">No saved schedules</option>}
            {scheduleNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {!loading && selectedName && (
        <div className="tp-snap-cap">
          {snapshots.length} / 10 snapshots
          {snapshots.length >= 10 && (
            <span className="tp-snap-cap-note"> · New snapshots replace the oldest.</span>
          )}
        </div>
      )}

      {loading && <div className="ver-empty">Loading snapshots…</div>}

      {!loading && snapshots.length === 0 && selectedName && (
        <div className="ver-empty">
          No snapshots yet for this schedule. Use <b>Snapshot</b> in the toolbar to save a restore point.
        </div>
      )}

      {!loading && snapshots.length > 0 && (
        <div className="ver-list">
          {snapshots.map((snap) => {
            const time = new Date(snap.savedAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            });
            const actCount = (snap.data?.rows ?? []).filter((r) => r.action && !r.sunLocked).length;
            return (
              <div key={snap.id} className="ver-item">
                <div className="ver-meta">
                  <div className="ver-title">
                    {time}
                    <span className="snapshot-badge">{snap.label || 'Snapshot'}</span>
                  </div>
                  <div className="ver-sub">{actCount} action{actCount === 1 ? '' : 's'}</div>
                </div>
                <div className="ver-acts">
                  <button className="btn btn-light btn-sm" onClick={() => setPreview(snap)}>Preview</button>
                  <button className="btn btn-light btn-sm" onClick={() => handleSaveAsNew(snap)}>Save As New</button>
                  <button className="btn btn-pink btn-sm"  onClick={() => handleRestore(snap)}>Restore</button>
                  <button className="tp-snap-del"          onClick={() => handleDelete(snap)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Snapshot preview overlay */}
      {preview && (
        <div className="snapshot-preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="snapshot-preview-modal" role="dialog" aria-modal>
            <div className="snapshot-preview-head">
              <div>
                <div className="snapshot-preview-title">Snapshot Preview</div>
                <div className="snapshot-preview-sub">
                  {selectedName} · {preview.label || 'Snapshot'} · {new Date(preview.savedAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-light btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="snapshot-preview-body">
              <div className="snapshot-preview-meta">
                <div><b>Schedule</b>{selectedName}</div>
                <div><b>Date</b>{preview.data?.meta?.date || '—'}</div>
                <div><b>Town / Location</b>{preview.data?.meta?.town || '—'}</div>
              </div>
              {(() => {
                const rows = (preview.data?.rows ?? []).filter(
                  (r) => !r.sunLocked && (r.action || r.notes || r.loc || r.desc)
                );
                return rows.length === 0 ? (
                  <div className="snapshot-preview-empty">This snapshot does not contain visible schedule rows.</div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table className="snapshot-preview-table">
                      <thead>
                        <tr><th>#</th><th>Action</th><th>Location</th><th>Description</th><th>Notes</th><th>Time In</th><th>Duration</th><th>Time Out</th></tr>
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
