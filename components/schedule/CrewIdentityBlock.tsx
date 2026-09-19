'use client';
import { useState, useRef, useEffect } from 'react';
import {useCmsStore} from '@/lib/store/cmsStore';
import { useScheduleStore } from '@/lib/store/scheduleStore';

type CrewField = 'prod' | 'dir' | 'dp';

const FIELDS: { key: CrewField; label: string }[] = [
  { key: 'prod', label: 'PRODUCER' },
  { key: 'dir',  label: 'DIRECTOR' },
  { key: 'dp',   label: 'CAMERA'   },
];

interface Props {
  readOnly?: boolean;
}

export default function CrewIdentityBlock({ readOnly = false }: Props) {
  const labels=useCmsStore(s=>s.config.labels);
  const meta       = useScheduleStore((s) => s.meta);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const [editing, setEditing] = useState<CrewField | null>(null);
  const [draft,   setDraft]   = useState('');
  const triggers = useRef<Partial<Record<CrewField, HTMLButtonElement | null>>>({});
  const returnFocus = useRef<CrewField | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else if (!editing && returnFocus.current) {
      triggers.current[returnFocus.current]?.focus();
      returnFocus.current = null;
    }
  }, [editing]);

  function startEdit(field: CrewField) {
    if (readOnly) return;
    setDraft(meta[field] ?? '');
    setEditing(field);
  }

  function confirm(returnToTrigger = false) {
    if (!editing) return;
    updateMeta({ [editing]: draft });
    returnFocus.current = returnToTrigger ? editing : null;
    setEditing(null);
  }

  function cancel() {
    returnFocus.current = editing;
    setEditing(null);
  }

  return (
    <div className="crew-id">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="crew-col">
          <span className="crew-label" onClick={() => startEdit(key)}>{labels?.[{prod:'metaProd',dir:'metaDir',dp:'metaDp'}[key]]||label}</span>
          {editing === key ? (
            <input
              ref={inputRef}
              className="crew-input"
              aria-label={labels?.[{prod:'metaProd',dir:'metaDir',dp:'metaDp'}[key]]||label}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => confirm()}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  { e.preventDefault(); confirm(true); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              }}
            />
          ) : readOnly ? (
            <span className={`crew-val${!meta[key] ? ' crew-empty' : ''}`}>{meta[key] || '—'}</span>
          ) : (
            <button
              type="button"
              ref={node => { triggers.current[key] = node; }}
              aria-label={`Edit ${labels?.[{prod:'metaProd',dir:'metaDir',dp:'metaDp'}[key]]||label}`}
              className={`inline-edit-trigger crew-val${!meta[key] ? ' crew-empty' : ''}`}
              onClick={() => startEdit(key)}
            >
              {meta[key] || '—'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
