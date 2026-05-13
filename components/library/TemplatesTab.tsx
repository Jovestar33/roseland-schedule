'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { useAuthStore } from '@/lib/store/authStore';
import { loadTemplates, saveTemplateRemote, deleteTemplateRemote, migrateTemplates } from '@/lib/api/templates';
import { getTemplates } from '@/lib/templates';
import { LS_TEMPLATES_KEY } from '@/lib/constants';
import { normalizeRows } from '@/lib/rowNormalizer';
import { recalcRows } from '@/lib/time';
import type { TemplateMap } from '@/lib/templates';

export default function TemplatesTab() {
  const router = useRouter();
  const token        = useAuthStore((s) => s.token);
  const rows         = useScheduleStore((s) => s.rows);
  const dirty        = useScheduleStore((s) => s.dirty);
  const loadSchedule = useScheduleStore((s) => s.loadSchedule);
  const meta         = useScheduleStore((s) => s.meta);

  const [templates, setTemplates]     = useState<TemplateMap>({});
  const [saveNameInput, setSaveNameInput] = useState('');
  const [status, setStatus]           = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    loadTemplates(token)
      .then(async (remote) => {
        // One-time localStorage migration: if remote is empty but local has templates, push them up
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
    const name = saveNameInput.trim();
    if (!name || !token) return;
    const updated = await saveTemplateRemote(name, rows, token).catch(() => null);
    if (updated) { setTemplates(updated); setSaveNameInput(''); }
  }

  function handleLoad(name: string) {
    const tpl = templates[name];
    if (!tpl) return;
    if (dirty && !confirm(`Load template "${name}"? Unsaved changes will be lost.`)) return;
    const normalized = normalizeRows(tpl.rows.map((r) => ({ ...r, sunLocked: false })));
    loadSchedule('New from: ' + name, { rows: recalcRows(normalized), meta, savedAt: 0 });
    router.push('/schedule/' + encodeURIComponent('New from: ' + name));
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete template "${name}"?`) || !token) return;
    const updated = await deleteTemplateRemote(name, token).catch(() => null);
    if (updated) setTemplates(updated);
  }

  const keys = Object.keys(templates).sort((a, b) => (templates[b].savedAt ?? 0) - (templates[a].savedAt ?? 0));

  return (
    <>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
        <input
          className="form-input"
          type="text"
          placeholder="Template name…"
          value={saveNameInput}
          onChange={(e) => setSaveNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ flex: '1 1 180px', minHeight: '34px', fontSize: '13px' }}
        />
        <button className="btn btn-pink btn-sm" onClick={handleSave} disabled={!saveNameInput.trim() || status !== 'ready'}>
          + Save Current as Template
        </button>
      </div>

      {status === 'loading' ? (
        <div className="empty">Loading templates…</div>
      ) : status === 'error' ? (
        <div className="empty">Could not load templates — check your connection.</div>
      ) : keys.length === 0 ? (
        <div className="empty">
          <strong>No templates saved yet.</strong><br />
          Build a schedule setup, then choose <b>+ Save Current as Template</b> to reuse it later.
        </div>
      ) : (
        <div className="slist">
          {keys.map((name) => {
            const tpl = templates[name];
            const cnt = (tpl.rows ?? []).filter((r) => r.action).length;
            return (
              <div key={name} className="sitem" onClick={() => handleLoad(name)}>
                <div className="sitem-info">
                  <div className="sitem-name">★ {name}</div>
                  <div className="sitem-meta">{cnt} action{cnt === 1 ? '' : 's'}</div>
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
