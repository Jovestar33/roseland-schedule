'use client';
import { useState } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';

type Field = 'projectName' | 'phase' | 'day';

interface Props { readOnly?: boolean; }

export default function HeaderIdentityLine({ readOnly = false }: Props) {
  const meta       = useScheduleStore((s) => s.meta);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft,   setDraft]   = useState('');

  const dayStr = meta.dayNumber !== null
    ? (meta.totalDays !== null ? `${meta.dayNumber}/${meta.totalDays}` : `${meta.dayNumber}`)
    : '';

  const allEmpty = !meta.projectName && !meta.phase && !dayStr;

  function startEdit(field: Field) {
    if (readOnly) return;
    const init = field === 'day'         ? dayStr
               : field === 'projectName' ? meta.projectName
               :                          meta.phase;
    setDraft(init);
    setEditing(field);
  }

  function commit() {
    if (!editing) return;
    if (editing === 'projectName') {
      updateMeta({ projectName: draft.trim() });
    } else if (editing === 'phase') {
      updateMeta({ phase: draft.trim() });
    } else {
      const t = draft.trim();
      if (!t) {
        updateMeta({ dayNumber: null, totalDays: null });
      } else {
        const [a, b] = t.split('/');
        const n = parseInt(a, 10);
        const tot = b !== undefined ? parseInt(b, 10) : null;
        if (n > 0) updateMeta({ dayNumber: n, totalDays: tot && tot > 0 ? tot : null });
        else updateMeta({ dayNumber: null, totalDays: null });
      }
    }
    setEditing(null);
  }

  function revert() { setEditing(null); }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); revert(); }
  }

  if (allEmpty && !editing) {
    if (readOnly) return null;
    return (
      <div className="hdr-identity">
        <span className="hi-ph" onClick={() => startEdit('projectName')}>
          Add project info
        </span>
      </div>
    );
  }

  const FIELDS: { id: Field; val: string; ph: string }[] = [
    { id: 'projectName', val: meta.projectName, ph: 'Project' },
    { id: 'phase',       val: meta.phase,        ph: 'Phase'   },
    { id: 'day',         val: dayStr,             ph: 'Day'     },
  ];

  // Only render fields that have a value OR are currently being edited.
  const visible = FIELDS.filter(f => f.val || editing === f.id);

  return (
    <div className="hdr-identity">
      {visible.map((f, i) => (
        <span key={f.id} className="hi-item">
          {i > 0 && <span className="hi-sep"> · </span>}
          {editing === f.id ? (
            <input
              className="hi-field"
              autoFocus
              value={draft}
              placeholder={f.ph}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              style={{ width: `${Math.max((draft || f.ph).length, 2)}ch` }}
            />
          ) : (
            <span
              className="hi-val"
              onClick={() => startEdit(f.id)}
            >
              {f.val}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
