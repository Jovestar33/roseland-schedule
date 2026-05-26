'use client';
import { useState, useEffect, useRef } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import ComboInput from './ComboInput';

type Field = 'projectName' | 'phase' | 'dayNumber' | 'totalDays';

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

  function startEdit(field: Field) {
    if (readOnly) return;
    const init =
      field === 'projectName' ? meta.projectName :
      field === 'phase'       ? meta.phase :
      field === 'dayNumber'   ? (meta.dayNumber  != null ? String(meta.dayNumber)  : '') :
                                (meta.totalDays != null ? String(meta.totalDays) : '');
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
    } else if (editing === 'dayNumber') {
      const n = parseInt(val.trim(), 10);
      updateMeta({ dayNumber: n > 0 ? n : null });
    } else {
      const n = parseInt(val.trim(), 10);
      updateMeta({ totalDays: n > 0 ? n : null });
    }
    setEditing(null);
  }

  function revert() { setEditing(null); }

  function onNumKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); revert(); }
  }

  // Read-only: two-row display, no edit controls
  if (readOnly) {
    const dayStr = meta.dayNumber != null
      ? (meta.totalDays != null ? `Day ${meta.dayNumber} of ${meta.totalDays}` : `Day ${meta.dayNumber}`)
      : '';
    const row2Parts = [meta.phase, dayStr].filter(Boolean);
    if (!meta.projectName && !row2Parts.length) return null;
    return (
      <div className="hdr-id-block">
        {meta.projectName && (
          <div className="hdr-id-row1">
            <span className="hi-project">{meta.projectName}</span>
          </div>
        )}
        {row2Parts.length > 0 && (
          <div className="hdr-id-row2">
            {row2Parts.map((p, i) => (
              <span key={i} className="hi-item">
                {i > 0 && <span className="hi-sep"> · </span>}
                <span className="hi-val">{p}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hdr-id-block">
      {/* Row 1: Project / Production Name */}
      <div className="hdr-id-row1">
        {editing === 'projectName' ? (
          <ComboInput
            className="hi-field"
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            onEscape={revert}
            options={projectOptions}
            placeholder="Project name"
            autoFocus
          />
        ) : (
          <span
            className={`hi-project${meta.projectName ? '' : ' hi-project-empty'}`}
            onClick={() => startEdit('projectName')}
          >
            {meta.projectName || 'Project name'}
          </span>
        )}
      </div>

      {/* Row 2: Phase · Day X of Y */}
      <div className="hdr-id-row2">
        {/* Phase */}
        {editing === 'phase' ? (
          <ComboInput
            className="hi-field"
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            onEscape={revert}
            options={phaseOptions}
            placeholder="Phase"
            autoFocus
          />
        ) : (
          <span
            className={meta.phase ? 'hi-val' : 'hi-empty'}
            onClick={() => startEdit('phase')}
          >
            {meta.phase || 'Phase'}
          </span>
        )}

        <span className="hi-sep"> · </span>

        {/* Day number and optional total */}
        <span className="hi-day-wrap">
          <span className="hi-day-lbl">Day </span>
          {editing === 'dayNumber' ? (
            <input
              className="hi-field"
              autoFocus
              type="text"
              inputMode="numeric"
              value={draft}
              placeholder="—"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onNumKey}
              style={{ width: `${Math.max((draft || '—').length, 2)}ch` }}
            />
          ) : (
            <span
              className={meta.dayNumber != null ? 'hi-val' : 'hi-empty'}
              onClick={() => startEdit('dayNumber')}
            >
              {meta.dayNumber ?? '—'}
            </span>
          )}
          {/* Show "of [total]" when dayNumber is set or when editing totalDays */}
          {(meta.dayNumber != null || editing === 'totalDays') && (
            <>
              <span className="hi-day-of"> of </span>
              {editing === 'totalDays' ? (
                <input
                  className="hi-field"
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={draft}
                  placeholder="—"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={onNumKey}
                  style={{ width: `${Math.max((draft || '—').length, 2)}ch` }}
                />
              ) : (
                <span
                  className={meta.totalDays != null ? 'hi-val' : 'hi-empty'}
                  onClick={() => startEdit('totalDays')}
                >
                  {meta.totalDays ?? '—'}
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
