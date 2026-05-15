'use client';
import { useState, useRef, useEffect } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';

type CrewField = 'prod' | 'dir' | 'dp';

const FIELDS: { key: CrewField; label: string }[] = [
  { key: 'prod', label: 'PROD' },
  { key: 'dir',  label: 'DIR'  },
  { key: 'dp',   label: 'CAM'  },
];

interface Props {
  readOnly?: boolean;
}

export default function CrewIdentityBlock({ readOnly = false }: Props) {
  const meta       = useScheduleStore((s) => s.meta);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const [editing, setEditing] = useState<CrewField | null>(null);
  const [draft,   setDraft]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit(field: CrewField) {
    if (readOnly) return;
    setDraft(meta[field] ?? '');
    setEditing(field);
  }

  function confirm() {
    if (!editing) return;
    updateMeta({ [editing]: draft });
    setEditing(null);
  }

  function cancel() {
    setEditing(null);
  }

  return (
    <div className="crew-id">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="crew-col">
          <span className="crew-label" onClick={() => startEdit(key)}>{label}</span>
          {editing === key ? (
            <input
              ref={inputRef}
              className="crew-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={confirm}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              }}
            />
          ) : (
            <span
              className={`crew-val${!meta[key] ? ' crew-empty' : ''}`}
              onClick={() => startEdit(key)}
            >
              {meta[key] || '—'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
