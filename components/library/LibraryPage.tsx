'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useCmsStore } from '@/lib/store/cmsStore';
import { listSchedules, postLoad } from '@/lib/api/load';
import { postDelete } from '@/lib/api/save';
import { getLibraryMeta, putLibraryMeta, type LibraryData } from '@/lib/api/library';
import type { ScheduleData } from '@/lib/types';
import ScheduleListTab, { type LibrarySchedule } from './ScheduleListTab';
import TemplatesTab from './TemplatesTab';
import VersionsTab from './VersionsTab';
import BackupTab from './BackupTab';

type Tab = 'schedules' | 'templates' | 'backup' | 'versions';

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

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.push('/login'); return; }
    loadLibrary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token]);

  async function loadLibrary() {
    setLoadingList(true);
    try {
      const [names, meta] = await Promise.all([listSchedules(token!), getLibraryMeta(token!)]);
      setLibMeta(meta);
      const items: LibrarySchedule[] = names.map((name) => ({ name, data: null, loading: true }));
      setSchedules(items);
      setLoadingList(false);

      const fetched = await Promise.all(
        names.map((name) =>
          postLoad(name, token!)
            .then((data): LibrarySchedule => ({ name, data: data as ScheduleData, loading: false }))
            .catch((): LibrarySchedule => ({ name, data: null, loading: false }))
        )
      );
      setSchedules(fetched);

      // Populate ComboInput caches for editor identity line
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
    } catch {
      setLoadingList(false);
    }
  }

  async function updateLibMeta(updated: LibraryData): Promise<void> {
    setLibMeta(updated);
    try {
      const saved = await putLibraryMeta(updated, token!);
      setLibMeta(saved);
    } catch { /* best-effort */ }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}" from My Library? This permanently removes the saved schedule.`)) return;
    const deletePassword = (prompt('Enter delete password:') ?? '').trim();
    if (!deletePassword) { alert('Delete cancelled — schedule kept.'); return; }
    try {
      await postDelete(name, token!, deletePassword);
      setSchedules((prev) => prev.filter((s) => s.name !== name));
      // Clean up phaseOrder for the deleted schedule
      if (libMeta.phaseOrder) {
        const po = JSON.parse(JSON.stringify(libMeta.phaseOrder)) as NonNullable<LibraryData['phaseOrder']>;
        for (const pk of Object.keys(po)) {
          for (const phk of Object.keys(po[pk])) {
            po[pk][phk] = po[pk][phk].filter((n) => n !== name);
          }
        }
        updateLibMeta({ ...libMeta, phaseOrder: po, updatedAt: Date.now() });
      }
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

  const scheduleNames = schedules.map((s) => s.name);

  return (
    <div className="lib-page">
      {/* Header */}
      <div className="lib-header">
        <h1 className="lib-title">Library</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-pink btn-sm" onClick={() => router.push('/schedule/Untitled')}>
            + New Schedule
          </button>
          <button className="btn btn-light btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
          <button className="btn btn-light btn-sm" onClick={handleLogout}>Log Out</button>
        </div>
      </div>

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
            <ScheduleListTab
              schedules={schedules}
              libMeta={libMeta}
              onDelete={handleDelete}
              onUpdateLibMeta={updateLibMeta}
            />
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
