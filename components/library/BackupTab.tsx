'use client';
import { useState } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import type { LibrarySchedule } from './ScheduleListTab';

interface Props {
  schedules: LibrarySchedule[];
  onRefresh: () => void;
}

export default function BackupTab({ schedules, onRefresh }: Props) {
  const token = useAuthStore((s) => s.token);
  const [syncMsg, setSyncMsg] = useState('');
  const [migrateState, setMigrateState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrateResult, setMigrateResult] = useState<{ migrated: string[]; skipped: string[]; errors: string[] } | null>(null);

  function exportJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportLibraryJson() {
    const bundle = schedules.reduce<Record<string, unknown>>((acc, s) => {
      if (s.data) acc[s.name] = s.data;
      return acc;
    }, {});
    exportJson(bundle, 'roseland-library.json');
  }

  function handleImportFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const keys = Object.keys(data);
        if (!keys.length) { alert('JSON file appears empty.'); return; }
        // Single-schedule format (has rows/meta) vs. library bundle (map of schedules)
        const isBundle = keys.every(k => typeof data[k] === 'object' && 'rows' in data[k]);
        if (isBundle) {
          alert(`Parsed library bundle with ${keys.length} schedule(s): ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''}.\n\nOpen each schedule in the editor and use Save to push it to the cloud.`);
        } else if ('rows' in data) {
          alert(`Parsed single schedule. Open a schedule in the editor and use Save to push changes.`);
        } else {
          alert('Unrecognized JSON format.');
        }
      } catch {
        alert('Invalid JSON file — could not parse.');
      }
    };
    reader.readAsText(file);
  }

  function handleSyncNow() {
    setSyncMsg('');
    onRefresh();
    setSyncMsg(`Synced at ${new Date().toLocaleTimeString()}`);
  }

  async function handleMigrateProjectMeta() {
    const confirmed = window.confirm(
      'This will set Project Name to "Main to Main Trail" and Phase to "Drive In / Drive Out" on all schedules that are missing a project name.\n\nSchedules that already have a project name will not be touched.\n\nContinue?'
    );
    if (!confirmed) return;
    setMigrateState('running');
    setMigrateResult(null);
    try {
      const res = await fetch('/.netlify/functions/migrate-project-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editorToken: token }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Migration failed');
      setMigrateResult({ migrated: json.migrated, skipped: json.skipped, errors: json.errors });
      setMigrateState('done');
    } catch (err) {
      setMigrateResult(null);
      setMigrateState('error');
      console.error('Migration error:', err);
    }
  }

  return (
    <div className="backup-wrap">
      <div className="backup-head">
        <div className="backup-head-copy">
          Use this tab for manual sync and JSON backup or import operations.
        </div>
        {syncMsg && <div className="lib-meta">{syncMsg}</div>}
      </div>
      <div className="backup-grid">
        <div className="backup-card">
          <h3>Sync &amp; Cleanup</h3>
          <div className="backup-actions">
            <button className="btn btn-light btn-sm" onClick={handleSyncNow}>&#8635; Sync Now</button>
            <button className="btn btn-light btn-sm" onClick={() => { onRefresh(); setSyncMsg('Retried — library reloaded.'); }}>Retry Pending</button>
            <button className="btn btn-light btn-sm" onClick={() => setSyncMsg('No local cache to clear.')}>Clear Stale Cache</button>
          </div>
          <div className="backup-note">Use these to re-fetch the library from the cloud or retry any pending operations.</div>
        </div>
        <div className="backup-card">
          <h3>Backup &amp; Import</h3>
          <div className="backup-actions">
            <button className="btn btn-light btn-sm" onClick={exportLibraryJson}>Export Library JSON</button>
            <label className="btn btn-pink btn-sm" style={{ cursor: 'pointer' }}>
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => { handleImportFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </label>
          </div>
          <div className="backup-note">Export the full library as JSON, or import a JSON backup to inspect it.</div>
        </div>
        <div className="backup-card">
          <h3>Admin Utilities</h3>
          <div className="backup-actions">
            <button
              className="btn btn-light btn-sm"
              onClick={handleMigrateProjectMeta}
              disabled={migrateState === 'running'}
            >
              {migrateState === 'running' ? 'Migrating…' : 'Migrate Project Metadata'}
            </button>
          </div>
          <div className="backup-note">
            One-time utility: sets Project Name and Phase on schedules that are missing them. Safe to run repeatedly — schedules with an existing project name are skipped.
          </div>
          {migrateState === 'done' && migrateResult && (
            <div className="backup-note" style={{ marginTop: 8 }}>
              <strong>Done.</strong> Migrated {migrateResult.migrated.length}, skipped {migrateResult.skipped.length}
              {migrateResult.errors.length > 0 && `, errors: ${migrateResult.errors.join(', ')}`}.
              {migrateResult.migrated.length > 0 && (
                <> Updated: {migrateResult.migrated.join(', ')}.</>
              )}
            </div>
          )}
          {migrateState === 'error' && (
            <div className="backup-note" style={{ marginTop: 8, color: 'red' }}>
              Migration failed — check the browser console for details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
