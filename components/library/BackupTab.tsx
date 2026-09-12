'use client';
import { useState, useRef } from 'react';
import { exportScheduleBackup, parseScheduleBackup, importScheduleBackup, type BackupSchedule } from '@/lib/api/backups';
import { useAuthStore } from '@/lib/store/authStore';
import type { LibrarySchedule } from './ScheduleListTab';

interface Props {
  schedules: LibrarySchedule[];
  onRefresh: () => void;
}

export default function BackupTab({ onRefresh }: Props) {
  const token = useAuthStore((s) => s.token);
  const [syncMsg, setSyncMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const busy = useRef(false);
  const [pendingImport, setPendingImport] = useState<BackupSchedule[]>([]);
  const [migrateState, setMigrateState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrateResult, setMigrateResult] = useState<{ migrated: string[]; skipped: string[]; errors: string[] } | null>(null);

  function exportJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportLibraryJson() {
    if (!token || busy.current) return;
    busy.current = true; setBackupBusy(true); setSyncMsg('Reading all saved schedules…');
    try {
      const bundle = await exportScheduleBackup(token);
      exportJson(bundle, 'roseland-schedules.json');
      setSyncMsg(`Exported ${bundle.schedules.length} schedules.`);
    } catch (error) { setSyncMsg(error instanceof Error ? error.message : 'Export failed.'); }
    finally { busy.current = false; setBackupBusy(false); }
  }

  async function handleImportFile(file: File | null) {
    if (!file || busy.current) return;
    busy.current = true; setBackupBusy(true); setPendingImport([]);
    try {
      if (file.size > 20_000_000) throw new Error('Backup exceeds 20 MB.');
      const entries = parseScheduleBackup(await file.text(), file.name.replace(/\.json$/i, ''));
      setPendingImport(entries.map(entry => ({ ...entry, name: `${entry.name} (imported)` })));
      setSyncMsg('Review the names below, then import. Existing schedules will never be overwritten.');
    } catch (error) { setSyncMsg(error instanceof Error ? error.message : 'Could not read backup.'); }
    finally { busy.current = false; setBackupBusy(false); }
  }

  async function confirmImport() {
    if (!token || busy.current) return;
    busy.current = true; setBackupBusy(true);
    try {
      const result = await importScheduleBackup(pendingImport, token);
      setSyncMsg(`Imported ${result.imported.length}. ${result.failed.map(item => `${item.name}: ${item.reason}`).join(' ')}`);
      setPendingImport(pendingImport.filter(entry => !result.imported.includes(entry.name)));
      onRefresh();
    } catch (error) { setSyncMsg(error instanceof Error ? error.message : 'Import failed.'); }
    finally { busy.current = false; setBackupBusy(false); }
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
            <button className="btn btn-light btn-sm" onClick={exportLibraryJson} disabled={backupBusy}>Export Schedules JSON</button>
            <label className="btn btn-pink btn-sm" style={{ cursor: 'pointer' }}>
              Import JSON
              <input
                type="file"
                disabled={backupBusy}
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => { handleImportFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </label>
          </div>
          <div className="backup-note">Export all saved schedule documents, or restore them as new schedules. Includes contacts and call-sheet data; keep the file private. Templates, snapshots, library organization and app settings are not included.</div>
        </div>
        {pendingImport.length > 0 && <div className="backup-card">
          <h3>Review import names</h3>
          {pendingImport.map((entry, index) => <label key={index} style={{ display: 'block', marginBottom: 8 }}>
            Schedule {index + 1}
            <input className="ci" value={entry.name} disabled={backupBusy}
              onChange={event => setPendingImport(items => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
          </label>)}
          <button className="btn btn-pink btn-sm" disabled={backupBusy} onClick={confirmImport}>{backupBusy ? 'Working…' : 'Import as new schedules'}</button>
          <button className="btn btn-light btn-sm" disabled={backupBusy} onClick={() => setPendingImport([])}>Cancel</button>
        </div>}
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
