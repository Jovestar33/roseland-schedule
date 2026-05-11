'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { getTemplates, saveTemplate, deleteTemplate, type TemplateMap } from '@/lib/templates';
import { normalizeRows } from '@/lib/rowNormalizer';
import { recalcRows } from '@/lib/time';

export default function TemplatesTab() {
  const router = useRouter();
  const rows         = useScheduleStore((s) => s.rows);
  const dirty        = useScheduleStore((s) => s.dirty);
  const loadSchedule = useScheduleStore((s) => s.loadSchedule);
  const meta         = useScheduleStore((s) => s.meta);

  const [templates, setTemplates] = useState<TemplateMap>({});
  const [saveNameInput, setSaveNameInput] = useState('');

  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  function handleSave() {
    const name = saveNameInput.trim();
    if (!name) return;
    saveTemplate(name, rows);
    setTemplates(getTemplates());
    setSaveNameInput('');
  }

  function handleLoad(name: string) {
    const tpl = templates[name];
    if (!tpl) return;
    if (dirty && !confirm(`Load template "${name}"? Unsaved changes will be lost.`)) return;
    const normalized = normalizeRows(tpl.rows.map((r) => ({ ...r, sunLocked: false })));
    loadSchedule('New from: ' + name, { rows: recalcRows(normalized), meta, savedAt: 0 });
    router.push('/schedule/' + encodeURIComponent('New from: ' + name));
  }

  function handleDelete(name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    deleteTemplate(name);
    setTemplates(getTemplates());
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
        <button className="btn btn-pink btn-sm" onClick={handleSave} disabled={!saveNameInput.trim()}>
          + Save Current as Template
        </button>
      </div>

      {keys.length === 0 ? (
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
