'use client';
import { useState, useEffect, useRef } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import ComboInput from './ComboInput';

type Field = 'projectName' | 'phase' | 'day';

interface Props { readOnly?: boolean; }

function titleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function readOptions(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export default function HeaderIdentityLine({ readOnly = false }: Props) {
  const meta       = useScheduleStore((s) => s.meta);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft,   _setDraft]  = useState('');
  const draftRef              = useRef('');
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [phaseOptions,   setPhaseOptions]   = useState<string[]>([]);

  useEffect(() => {
    setProjectOptions(readOptions('rp_lib_project_options'));
    setPhaseOptions(readOptions('rp_lib_phase_options'));
  }, []);

  function setDraft(v: string) {
    draftRef.current = v;
    _setDraft(v);
  }

  const dayStr = meta.dayNumber !== null
    ? (meta.totalDays !== null ? `Day ${meta.dayNumber}/${meta.totalDays}` : `Day ${meta.dayNumber}`)
    : '';

  const dayEditStr = meta.dayNumber !== null
    ? (meta.totalDays !== null ? `${meta.dayNumber}/${meta.totalDays}` : `${meta.dayNumber}`)
    : '';

  function startEdit(field: Field) {
    if (readOnly) return;
    const init = field === 'day'         ? dayEditStr
               : field === 'projectName' ? meta.projectName
               :                          meta.phase;
    setDraft(init);
    setEditing(field);
  }

  function commit() {
    if (!editing) return;
    const val = draftRef.current;
    if (editing === 'projectName') {
      updateMeta({ projectName: titleCase(val) });
    } else if (editing === 'phase') {
      updateMeta({ phase: titleCase(val) });
    } else {
      const t = val.trim();
      if (!t) {
        updateMeta({ dayNumber: null, totalDays: null });
      } else {
        const [a, b] = t.split('/');
        const n   = parseInt(a, 10);
        const tot = b !== undefined ? parseInt(b, 10) : null;
        if (n > 0) updateMeta({ dayNumber: n, totalDays: tot && tot > 0 ? tot : null });
        else       updateMeta({ dayNumber: null, totalDays: null });
      }
    }
    setEditing(null);
  }

  function revert() { setEditing(null); }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); revert(); }
  }

  // Read-only: show only non-empty values, omit empties and their separators.
  if (readOnly) {
    const parts = [meta.projectName, meta.phase, dayStr].filter(Boolean);
    if (!parts.length) return null;
    return (
      <div className="hdr-identity">
        {parts.map((p, i) => (
          <span key={i} className="hi-item">
            {i > 0 && <span className="hi-sep"> · </span>}
            <span className="hi-val">{p}</span>
          </span>
        ))}
      </div>
    );
  }

  const FIELDS: { id: Field; val: string; ph: string }[] = [
    { id: 'projectName', val: meta.projectName, ph: 'Project'  },
    { id: 'phase',       val: meta.phase,        ph: 'Phase'    },
    { id: 'day',         val: dayStr,             ph: 'Day #/#'  },
  ];

  return (
    <div className="hdr-identity">
      {FIELDS.map((f, i) => (
        <span key={f.id} className="hi-item">
          {i > 0 && <span className="hi-sep"> · </span>}
          {editing === f.id ? (
            f.id === 'projectName' ? (
              <ComboInput
                className="hi-field"
                value={draft}
                onChange={setDraft}
                onBlur={commit}
                onEscape={revert}
                options={projectOptions}
                placeholder={f.ph}
                autoFocus
              />
            ) : f.id === 'phase' ? (
              <ComboInput
                className="hi-field"
                value={draft}
                onChange={setDraft}
                onBlur={commit}
                onEscape={revert}
                options={phaseOptions}
                placeholder={f.ph}
                autoFocus
              />
            ) : (
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
            )
          ) : (
            <span
              className={f.val ? 'hi-val' : 'hi-empty'}
              onClick={() => startEdit(f.id)}
            >
              {f.val || f.ph}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
