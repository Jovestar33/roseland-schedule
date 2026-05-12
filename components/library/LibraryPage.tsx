'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { listSchedules, postLoad } from '@/lib/api/load';
import { postDelete } from '@/lib/api/save';
import { getLibraryMeta, putLibraryMeta, type LibraryData, type LibraryFolder } from '@/lib/api/library';
import type { ScheduleData } from '@/lib/types';
import ScheduleListTab, { type LibrarySchedule } from './ScheduleListTab';
import TemplatesTab from './TemplatesTab';
import VersionsTab from './VersionsTab';
import BackupTab from './BackupTab';

type Tab = 'schedules' | 'templates' | 'backup' | 'versions';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function LibraryPage() {
  const router = useRouter();
  const token   = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout   = useAuthStore((s) => s.logout);

  const [tab, setTab]               = useState<Tab>('schedules');
  const [schedules, setSchedules]   = useState<LibrarySchedule[]>([]);
  const [libMeta, setLibMeta]       = useState<LibraryData>({ version: 1, folders: [], scheduleFolderMap: {}, updatedAt: 0 });
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.push('/login'); return; }
    loadLibrary();
  }, [hydrated, token]);

  async function loadLibrary() {
    setLoadingList(true);
    try {
      const [names, meta] = await Promise.all([
        listSchedules(token!),
        getLibraryMeta(token!),
      ]);
      setLibMeta(meta);
      // Initialise items with loading placeholders
      const items: LibrarySchedule[] = names.map((name) => ({ name, data: null, loading: true }));
      setSchedules(items);
      setLoadingList(false);
      // Parallel-fetch all schedule data
      const fetched = await Promise.all(
        names.map((name) =>
          postLoad(name, token!)
            .then((data): LibrarySchedule => ({ name, data: data as ScheduleData, loading: false }))
            .catch((): LibrarySchedule => ({ name, data: null, loading: false }))
        )
      );
      setSchedules(fetched);
    } catch {
      setLoadingList(false);
    }
  }

  async function updateLibMeta(updated: LibraryData) {
    setLibMeta(updated);
    try {
      const saved = await putLibraryMeta(updated, token!);
      setLibMeta(saved);
    } catch { /* best-effort */ }
  }

  function handleCreateFolder(name: string) {
    if (libMeta.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      alert('A project with that name already exists.');
      return;
    }
    const folder: LibraryFolder = { id: makeId('folder'), name, createdAt: Date.now(), updatedAt: Date.now() };
    const updated = { ...libMeta, folders: [...libMeta.folders, folder], updatedAt: Date.now() };
    setSelectedFolder(folder.id);
    updateLibMeta(updated);
  }

  function handleRenameFolder(id: string) {
    const f = libMeta.folders.find((x) => x.id === id);
    if (!f) return;
    const name = (prompt('Rename project:', f.name) ?? '').trim();
    if (!name) return;
    if (libMeta.folders.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) {
      alert('A project with that name already exists.');
      return;
    }
    const updated = {
      ...libMeta,
      folders: libMeta.folders.map((x) => x.id === id ? { ...x, name, updatedAt: Date.now() } : x),
      updatedAt: Date.now(),
    };
    updateLibMeta(updated);
  }

  function handleDeleteFolder(id: string) {
    const f = libMeta.folders.find((x) => x.id === id);
    if (!f) return;
    const count = Object.values(libMeta.scheduleFolderMap).filter((fid) => fid === id).length;
    if (count > 0) { alert('Move or delete schedules out of this project before deleting it.'); return; }
    if (!confirm(`Delete project "${f.name}"? Schedules will not be deleted.`)) return;
    const updated = {
      ...libMeta,
      folders: libMeta.folders.filter((x) => x.id !== id),
      updatedAt: Date.now(),
    };
    setSelectedFolder('all');
    updateLibMeta(updated);
  }

  function handleMoveSchedule(name: string, folderId: string) {
    const updated = {
      ...libMeta,
      scheduleFolderMap: { ...libMeta.scheduleFolderMap, [name]: folderId },
      updatedAt: Date.now(),
    };
    updateLibMeta(updated);
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}" from My Library? This permanently removes the saved schedule.`)) return;
    const deletePassword = (prompt('Enter delete password:') ?? '').trim();
    if (!deletePassword) { alert('Delete cancelled — schedule kept.'); return; }
    try {
      await postDelete(name, token!, deletePassword);
      setSchedules((prev) => prev.filter((s) => s.name !== name));
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
          🕐 Versions / Restore
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
              libraryMeta={libMeta}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveSchedule={handleMoveSchedule}
              onDelete={handleDelete}
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
