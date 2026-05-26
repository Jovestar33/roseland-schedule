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
  const [editing,       setEditing]       = useState<Field | null>(null);
  const [draft,         _setDraft]        = useState('');
  const draftRef                          = useRef('');
  const [validationMsg, setValidationMsg] = useState('');
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
    setValidationMsg('');
    let init = '';
    if (field === 'projectName') {
      init = meta.projectName;
    } else if (field === 'phase') {
      init = meta.phase;
    } else {
      // day: encode as slash notation for editing
      if (meta.dayNumber != null) {
        init = meta.totalDays != null ? `${meta.dayNumber}/${meta.totalDays}` : String(meta.dayNumber);
      }
    }
    setDraft(init);
    setEditing(field);
  }

  function showValidation(msg: string) {
    setValidationMsg(msg);
    setEditing(null);
    setTimeout(() => setValidationMsg(''), 2500);
  }

  function commitDay(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      updateMeta({ dayNumber: null, totalDays: null });
      setEditing(null);
      return;
    }
    const slashIdx = trimmed.indexOf('/');
    const dayStr = slashIdx === -1 ? trimmed : trimmed.slice(0, slashIdx).trim();
    const totStr = slashIdx === -1 ? '' : trimmed.slice(slashIdx + 1).trim();

    if (!dayStr) { showValidation('Day number required (e.g. 1 or 1/5)'); return; }
    const n = parseInt(dayStr, 10);
    if (isNaN(n) || n <= 0) { showValidation('Day must be a positive number'); return; }

    let total: number | null = null;
    if (totStr) {
      const t = parseInt(totStr, 10);
      if (isNaN(t) || t <= 0) { showValidation('Total must be a positive number'); return; }
      if (n > t) { showValidation(`Day ${n} can't exceed total ${t}`); return; }
      total = t;
    }

    updateMeta({ dayNumber: n, totalDays: total });
    setEditing(null);
  }

  function commit() {
    if (!editing) return;
    const val = draftRef.current;
    if (editing === 'projectName') {
      updateMeta({ projectName: titleCase(val) });
      setEditing(null);
    } else if (editing === 'phase') {
      updateMeta({ phase: titleCase(val) });
      setEditing(null);
    } else {
      commitDay(val);
    }
  }

  function revert() { setEditing(null); }

  function onDayKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitDay(draftRef.current); }
    if (e.key === 'Escape') { e.preventDefault(); revert(); }
  }

  // Build display strings
  const dayDisplayStr = meta.dayNumber != null
    ? (meta.totalDays != null
        ? `${meta.dayNumber} of ${meta.totalDays}`
        : String(meta.dayNumber))
    : '—';

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
            showAllOnOpen
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
            showAllOnOpen
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

        {/* Day — single slash-notation field */}
        <span className="hi-day-wrap">
          <span className="hi-day-lbl">Day </span>
          {editing === 'day' ? (
            <input
              className="hi-field"
              autoFocus
              type="text"
              inputMode="numeric"
              value={draft}
              placeholder="#/# or #"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitDay(draftRef.current)}
              onKeyDown={onDayKey}
              style={{ width: `${Math.max((draft || '#/#').length, 4)}ch` }}
            />
          ) : (
            <span
              className={meta.dayNumber != null ? 'hi-val' : 'hi-empty'}
              onClick={() => startEdit('day')}
            >
              {dayDisplayStr}
            </span>
          )}
        </span>
      </div>

      {/* Inline validation feedback */}
      {validationMsg && (
        <div className="hi-day-err">{validationMsg}</div>
      )}
    </div>
  );
}
