'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryData, LibraryFolder } from '@/lib/api/library';
import type { ScheduleData } from '@/lib/types';

export interface LibrarySchedule {
  name: string;
  data: ScheduleData | null;
  loading: boolean;
}

interface Props {
  schedules: LibrarySchedule[];
  libraryMeta: LibraryData;
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveSchedule: (name: string, folderId: string) => void;
  onDelete: (name: string) => void;
}

function folderName(meta: LibraryData, id: string): string {
  if (id === 'uncategorized') return 'Uncategorized';
  return meta.folders.find((f) => f.id === id)?.name ?? '';
}

export default function ScheduleListTab({
  schedules,
  libraryMeta,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSchedule,
  onDelete,
}: Props) {
  const router = useRouter();
  const [newFolderInput, setNewFolderInput] = useState('');

  function handleCreateFolder() {
    const name = newFolderInput.trim();
    if (!name) return;
    onCreateFolder(name);
    setNewFolderInput('');
  }

  function copyTeamLink(name: string) {
    const url = `${window.location.origin}/schedule/${encodeURIComponent(name)}`;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy link:', url));
  }

  const counts: Record<string, number> = { all: schedules.length, uncategorized: 0 };
  schedules.forEach(({ name }) => {
    const fid = libraryMeta.scheduleFolderMap[name] ?? 'uncategorized';
    counts[fid] = (counts[fid] ?? 0) + 1;
    if (fid !== 'uncategorized') counts.uncategorized = counts.uncategorized; // no change
    else counts.uncategorized = (counts.uncategorized ?? 0);
  });
  schedules.forEach(({ name }) => {
    const fid = libraryMeta.scheduleFolderMap[name] ?? 'uncategorized';
    if (fid === 'uncategorized') counts.uncategorized = (counts.uncategorized ?? 0);
  });
  // recompute cleanly
  const uncatCount = schedules.filter(({ name }) => (libraryMeta.scheduleFolderMap[name] ?? 'uncategorized') === 'uncategorized').length;

  const folderCards: Array<{ id: string; name: string; count: number }> = [
    { id: 'all', name: 'All Schedules', count: schedules.length },
    { id: 'uncategorized', name: 'Uncategorized', count: uncatCount },
    ...libraryMeta.folders.map((f: LibraryFolder) => ({
      id: f.id,
      name: f.name,
      count: schedules.filter(({ name }) => libraryMeta.scheduleFolderMap[name] === f.id).length,
    })),
  ];

  const visible = schedules.filter(({ name }) => {
    if (selectedFolder === 'all') return true;
    return (libraryMeta.scheduleFolderMap[name] ?? 'uncategorized') === selectedFolder;
  });

  const sorted = [...visible].sort((a, b) => (b.data?.savedAt ?? 0) - (a.data?.savedAt ?? 0));

  const allFolderOptions = [
    { value: 'uncategorized', label: 'Uncategorized' },
    ...libraryMeta.folders.map((f: LibraryFolder) => ({ value: f.id, label: f.name })),
  ];

  return (
    <>
      {/* Folder toolbar */}
      <div className="lib-folder-toolbar">
        <div>
          <div className="lib-folder-title">Projects</div>
          <div className="lib-folder-sub">Organize saved schedules.</div>
        </div>
        <div className="lib-folder-actions">
          <input
            className="form-input"
            type="text"
            placeholder="New project / folder name…"
            value={newFolderInput}
            onChange={(e) => setNewFolderInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <button className="btn btn-pink btn-sm" onClick={handleCreateFolder}>+ New Project</button>
        </div>
      </div>

      {/* Folder cards */}
      <div className="folder-list">
        {folderCards.map((c) => (
          <div
            key={c.id}
            className={`folder-card${c.id === selectedFolder ? ' active' : ''}`}
            onClick={() => onSelectFolder(c.id)}
          >
            <div className="folder-card-name">
              {c.id === 'all' ? '📁 ' : c.id === 'uncategorized' ? '🗂 ' : '🎬 '}
              {c.name}
            </div>
            <div className="folder-card-meta">{c.count} schedule{c.count === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>

      {/* View bar */}
      <div className="lib-viewbar">
        <div className="lib-viewname">
          {selectedFolder === 'all' ? 'All Schedules' : folderName(libraryMeta, selectedFolder)}
        </div>
        <div className="lib-viewtools">
          {selectedFolder !== 'all' && selectedFolder !== 'uncategorized' && (
            <>
              <button className="btn btn-light btn-sm" onClick={() => onRenameFolder(selectedFolder)}>Rename Project</button>
              <button className="btn btn-light btn-sm" onClick={() => onDeleteFolder(selectedFolder)}>Delete Project</button>
              <button className="btn btn-light btn-sm" onClick={() => onSelectFolder('all')}>View All</button>
            </>
          )}
          {selectedFolder === 'uncategorized' && (
            <button className="btn btn-light btn-sm" onClick={() => onSelectFolder('all')}>View All</button>
          )}
        </div>
      </div>

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <div className="empty">
          <strong>No schedules yet.</strong><br />
          Create a new schedule, then save it to keep it here.
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty">
          <strong>No schedules in {folderName(libraryMeta, selectedFolder) || 'this project'}.</strong><br />
          Use the project dropdown on any schedule to move it here.
        </div>
      ) : (
        <div className="slist">
          {sorted.map(({ name, data, loading }) => {
            const town = data?.meta?.town ? data.meta.town.split(',')[0].trim() : '';
            const dateStr = data?.meta?.date
              ? new Date(data.meta.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '';
            const acts = data ? (data.rows ?? []).filter((r) => r.action && !r.sunLocked).length : 0;
            const fid = libraryMeta.scheduleFolderMap[name] ?? 'uncategorized';
            const fLabel = fid === 'uncategorized' ? 'Uncategorized' : folderName(libraryMeta, fid);

            return (
              <div key={name} className="sitem" onClick={() => router.push(`/schedule/${encodeURIComponent(name)}`)}>
                <div className="sitem-info">
                  <div className="sitem-name">{name}</div>
                  <div className="sitem-meta">
                    {loading ? 'Loading…' : (
                      <>
                        {town}{dateStr ? ` · ${dateStr}` : ''}{` · ${acts} action${acts === 1 ? '' : 's'}`}
                        <span className="sitem-folder-tag">{fLabel}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="sitem-acts" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="sitem-folder-select"
                    value={fid}
                    onChange={(e) => onMoveSchedule(name, e.target.value)}
                    title="Move to project"
                  >
                    {allFolderOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button className="sitem-copy" onClick={() => copyTeamLink(name)} title="Copy edit link">Team Link</button>
                  <button className="sitem-del" onClick={() => onDelete(name)} title="Delete schedule">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
