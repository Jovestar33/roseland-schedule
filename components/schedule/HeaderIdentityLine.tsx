'use client';
import { useState, useEffect, useRef } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import ComboInput from './ComboInput';
import { useLocalEditor } from './LocalEditorContext';

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
  const localEditor = useLocalEditor();
  const meta       = useScheduleStore((s) => s.meta);
  const updateMeta = useScheduleStore((s) => s.updateMeta);
  const [editing,       setEditing]       = useState<Field | null>(null);
  const [draft,         _setDraft]        = useState('');
  const draftRef                          = useRef('');
  const dayInputRef                       = useRef<HTMLInputElement>(null);
  const [validationMsg, setValidationMsg] = useState('');
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [phaseOptions,   setPhaseOptions]   = useState<string[]>([]);

  const triggers = useRef<Partial<Record<Field, HTMLButtonElement | null>>>({});
  const returnFocus = useRef<Field | null>(null);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      triggers.current[returnFocus.current]?.focus();
      returnFocus.current = null;
    }
  }, [editing]);

  function finish(returnToTrigger = false) {
    returnFocus.current = returnToTrigger ? editing : null;
    setEditing(null);
  }

  useEffect(() => {
    setProjectOptions(localEditor ? [] : readOptions('rp_lib_project_options'));
    setPhaseOptions(localEditor ? [] : readOptions('rp_lib_phase_options'));
  }, [localEditor]);

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
      if (meta.dayNumber != null) {
        init = meta.totalDays != null ? `${meta.dayNumber}/${meta.totalDays}` : String(meta.dayNumber);
      }
    }
    setDraft(init);
    setEditing(field);
  }

  // Enforced slash-format input handler — only digits and one slash accepted
  function handleDayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newRaw     = e.target.value;
    const prevVal    = draftRef.current;
    const isDeleting = newRaw.length < prevVal.length;

    let filtered = newRaw.replace(/[^\d/]/g, '');
    if (filtered.startsWith('/')) filtered = filtered.slice(1);
    const si = filtered.indexOf('/');
    if (si !== -1) {
      filtered = filtered.slice(0, si + 1) + filtered.slice(si + 1).replace(/\//g, '');
    }
    const parts = filtered.split('/');
    let result = parts[0].slice(0, 3);
    if (parts.length > 1) result += '/' + parts[1].slice(0, 3);

    // Auto-insert slash when typing (not deleting) and no slash present yet
    const autoSlash = !isDeleting && !result.includes('/') && result.length > 0;
    if (autoSlash) result += '/';

    // Clear any standing validation error as the user types a correction
    if (validationMsg) setValidationMsg('');

    setDraft(result);

    if (autoSlash) {
      setTimeout(() => dayInputRef.current?.setSelectionRange(result.length, result.length), 0);
    }
  }

  function commitDay(raw: string, returnToTrigger = false) {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) {
      setValidationMsg('');
      updateMeta({ dayNumber: null, totalDays: null });
      finish(returnToTrigger);
      return;
    }
    const slashIdx = trimmed.indexOf('/');
    const dayStr = slashIdx === -1 ? trimmed : trimmed.slice(0, slashIdx).trim();
    const totStr = slashIdx === -1 ? '' : trimmed.slice(slashIdx + 1).trim();

    if (!dayStr) {
      setValidationMsg('Day number required (e.g. 1 or 1/5)');
      return; // keep editor open
    }
    const n = parseInt(dayStr, 10);
    if (isNaN(n) || n <= 0) {
      setValidationMsg('Day must be a positive number');
      return; // keep editor open
    }

    let total: number | null = null;
    if (totStr) {
      const t = parseInt(totStr, 10);
      if (isNaN(t) || t <= 0) {
        setValidationMsg('Total must be a positive number');
        return; // keep editor open
      }
      if (n > t) {
        setValidationMsg(`Day ${n} cannot exceed total ${t}`);
        return; // keep editor open
      }
      total = t;
    }

    setValidationMsg('');
    updateMeta({ dayNumber: n, totalDays: total });
    finish(returnToTrigger);
  }

  function commit(returnToTrigger = false) {
    if (!editing) return;
    const val = draftRef.current;
    if (editing === 'projectName') {
      updateMeta({ projectName: titleCase(val) });
      finish(returnToTrigger);
    } else if (editing === 'phase') {
      updateMeta({ phase: titleCase(val) });
      finish(returnToTrigger);
    } else {
      commitDay(val, returnToTrigger);
    }
  }

  function revert() {
    // All inline edits remain drafts until commit; Escape must not dirty the document.
    setValidationMsg('');
    finish(true);
  }

  function onDayKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitDay(draftRef.current, true); }
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
            onBlur={() => commit()}
            onCommit={() => commit(true)}
            onEscape={revert}
            options={projectOptions}
            placeholder="Project name"
            showAllOnOpen
            autoFocus
          />
        ) : (
          <button
            type="button"
            aria-label="Edit project name"
            ref={node => { triggers.current.projectName = node; }}
            className={`inline-edit-trigger hi-project${meta.projectName ? '' : ' hi-project-empty'}`}
            onClick={() => startEdit('projectName')}
          >
            {meta.projectName || 'Project name'}
          </button>
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
            onBlur={() => commit()}
            onCommit={() => commit(true)}
            onEscape={revert}
            options={phaseOptions}
            placeholder="Phase"
            showAllOnOpen
            autoFocus
          />
        ) : (
          <button
            type="button"
            aria-label="Edit phase"
            ref={node => { triggers.current.phase = node; }}
            className={`inline-edit-trigger ${meta.phase ? 'hi-val' : 'hi-empty'}`}
            onClick={() => startEdit('phase')}
          >
            {meta.phase || 'Phase'}
          </button>
        )}

        <span className="hi-sep"> · </span>

        {/* Day — single slash-notation field */}
        <span className="hi-day-wrap">
          <span className="hi-day-lbl">Day </span>
          {editing === 'day' ? (
            <input
              ref={dayInputRef}
              className={`hi-field${validationMsg ? ' hi-field-err' : ''}`}
              autoFocus
              type="text"
              inputMode="text"
              aria-label="Production day"
              aria-invalid={!!validationMsg}
              value={draft}
              placeholder="1/5"
              onChange={handleDayChange}
              onBlur={() => commitDay(draftRef.current)}
              onKeyDown={onDayKey}
              style={{ width: `${Math.max((draft || '1/5').length, 3)}ch` }}
            />
          ) : (
            <button
              type="button"
              aria-label="Edit production day"
              ref={node => { triggers.current.day = node; }}
              className={`inline-edit-trigger ${meta.dayNumber != null ? 'hi-val' : 'hi-empty'}`}
              onClick={() => startEdit('day')}
            >
              {dayDisplayStr}
            </button>
          )}
        </span>
      </div>

      {/* Inline validation feedback — persists until user corrects or escapes */}
      {validationMsg && (
        <div className="hi-day-err">{validationMsg}</div>
      )}
    </div>
  );
}
