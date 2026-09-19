'use client';
import {useCmsStore} from '@/lib/store/cmsStore';
import { useState, useEffect, useRef, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import Modal, { ModalVisibilityContext } from './Modal';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';
import { useDocumentProviders } from '@/components/local/DocumentProvidersContext';
import { documentContacts } from '@/lib/document-tools';
import { printDocument } from '@/lib/print';
const CallSheetReadOnly = createContext(false);
import PlacesAutocomplete from '@/components/schedule/PlacesAutocomplete';
import type { ScheduleRow, WeatherData, CallSheetData } from '@/lib/types';

// ---- Derived-data helpers ----

interface SchedLine { timeIn: string; action: string; loc: string; isSun: boolean; }

function buildLines(rows: ScheduleRow[]): SchedLine[] {
  const out: SchedLine[] = [];
  for (const row of rows) {
    if (row.sunLocked) {
      if (row.timeIn || row.action) out.push({ timeIn: row.timeIn, action: row.action, loc: '', isSun: true });
      continue;
    }
    if (!row.timeIn && !row.action) continue;
    out.push({
      timeIn: row.timeIn,
      action: row.action === 'Other' ? (row.otherText || 'Other') : row.action,
      loc: row.locName || row.loc,
      isSun: false,
    });
  }
  return out;
}

function deriveCall(rows: ScheduleRow[]): string {
  for (const row of rows) { if (!row.sunLocked && row.timeIn) return row.timeIn; }
  return '';
}

interface Contact { name: string; title: string; phone: string; email: string; }

function buildWxStr(wx: WeatherData | null | undefined): string {
  if (!wx) return '';
  const parts: string[] = [];
  if (wx.cond) parts.push(wx.cond);
  if (wx.maxF != null && wx.minF != null) parts.push(`${wx.minF}–${wx.maxF}°F`);
  else if (wx.maxF != null) parts.push(`${wx.maxF}°F`);
  return parts.join(' · ');
}

function buildDayStr(dayNumber: number | null, totalDays: number | null): string {
  if (dayNumber == null) return '';
  return totalDays != null ? `Day ${dayNumber} of ${totalDays}` : `Day ${dayNumber}`;
}

// ---- Inline editable field (single-line) ----

type CSKey = keyof CallSheetData;

// Keep cancellation separate from blur so removing the input cannot commit a
// cancelled draft. Only explicit keyboard completion returns focus; Tab moves on.
function useFieldEdit(value: string, fieldKey: CSKey, onCommit: (key: CSKey, val: string) => void) {
  const readOnly = useContext(CallSheetReadOnly);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const active = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  function change(next: string) { draftRef.current = next; setDraft(next); }
  function start() {
    if (readOnly) return;
    change(value); active.current = true; setEditing(true);
  }
  function finish(commit: boolean, focus = false, next = draftRef.current) {
    if (!active.current) return;
    active.current = false;
    returnFocus.current = focus;
    if (commit && !readOnly) onCommit(fieldKey, next);
    setEditing(false);
  }
  return {readOnly, editing, draft, change, start, finish, triggerRef};
}

function Field({
  label, fieldKey, value, placeholder = '—', onCommit,
}: {
  label: string; fieldKey: CSKey; value: string; placeholder?: string;
  onCommit: (key: CSKey, val: string) => void;
}) {
  const edit = useFieldEdit(value, fieldKey, onCommit);
  return (
    <div className="csh-field">
      <span className="csh-fl">{label}</span>
      {edit.editing ? (
        <input
          className="csh-fi"
          aria-label={label}
          disabled={edit.readOnly}
          autoFocus
          value={edit.draft}
          onChange={(e) => edit.change(e.target.value)}
          onBlur={() => edit.finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); edit.finish(true, true); }
            if (e.key === 'Escape') { e.preventDefault(); edit.finish(false, true); }
          }}
        />
      ) : edit.readOnly ? (
        <span className={value ? 'csh-fv' : 'csh-fv csh-fv-empty'}>{value || placeholder}</span>
      ) : (
        <button type="button" ref={edit.triggerRef} aria-label={`Edit ${label}`}
          className={`csh-edit-trigger csh-fv${value ? '' : ' csh-fv-empty'}`} onClick={edit.start}>
          {value || placeholder}
        </button>
      )}
    </div>
  );
}

// ---- Inline editable location field (single-line + Places autocomplete + map pin) ----

function LocationField({
  label, fieldKey, value, placeholder = '—', onCommit,
}: {
  label: string; fieldKey: CSKey; value: string; placeholder?: string;
  onCommit: (key: CSKey, val: string) => void;
}) {
  const edit = useFieldEdit(value, fieldKey, onCommit);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (edit.editing) wrapRef.current?.querySelector('input')?.focus();
  }, [edit.editing]);

  function handleWrapBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) edit.finish(true);
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); edit.finish(false, true); }
    // Autocomplete owns Enter when it is selecting a suggestion.
    if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); edit.finish(true, true); }
  }

  const local = useLocalEditor();
  const providers = useDocumentProviders();
  const mapUrl = (!local || providers?.kind === 'live') && value
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`
    : '';

  return (
    <div className="csh-field">
      <span className="csh-fl">{label}</span>
      {edit.editing ? (
        <div ref={wrapRef} className="csh-loc-wrap" onBlur={handleWrapBlur} onKeyDown={handleKeyDown}>
          <PlacesAutocomplete
            disabled={edit.readOnly}
            ariaLabel={label}
            className="csh-fi"
            value={edit.draft}
            onChange={edit.change}
            onSelect={(addr) => edit.finish(true, true, addr)}
            placeholder={placeholder}
          />
        </div>
      ) : (
        <>
          {edit.readOnly ? (
            <span className={value ? 'csh-fv' : 'csh-fv csh-fv-empty'}>{value || placeholder}</span>
          ) : (
            <button type="button" ref={edit.triggerRef} aria-label={`Edit ${label}`}
              className={`csh-edit-trigger csh-fv${value ? '' : ' csh-fv-empty'}`} onClick={edit.start}>
              {value || placeholder}
            </button>
          )}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="csh-loc-pin" aria-label="Open in Maps">📍</a>
          )}
        </>
      )}
    </div>
  );
}

// ---- Inline editable notes (multi-line) ----

function Notes({ label, fieldKey, value, onCommit }: {
  label: string; fieldKey: CSKey; value: string;
  onCommit: (key: CSKey, val: string) => void;
}) {
  const edit = useFieldEdit(value, fieldKey, onCommit);
  return (
    <div className="csh-field csh-field-notes">
      <span className="csh-fl">{label}</span>
      {edit.editing ? (
        <textarea
          aria-label={label}
          disabled={edit.readOnly}
          className="csh-fi csh-notes-ta"
          autoFocus
          value={edit.draft}
          rows={3}
          onChange={(e) => edit.change(e.target.value)}
          onBlur={() => edit.finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); edit.finish(false, true); }
          }}
        />
      ) : edit.readOnly ? (
        <span className={value ? 'csh-fv' : 'csh-fv csh-fv-empty'} style={{whiteSpace:'pre-wrap'}}>{value || '—'}</span>
      ) : (
        <button type="button" ref={edit.triggerRef} aria-label={`Edit ${label}`}
          className={`csh-edit-trigger csh-fv${value ? '' : ' csh-fv-empty'}`}
          onClick={edit.start} style={{whiteSpace:'pre-wrap'}}>{value || '—'}</button>
      )}
    </div>
  );
}

// ---- Print-only document ----

interface PrintDocProps {
  scheduleName: string;
  formattedDate: string;
  dayStr: string;
  projectName: string;
  phase: string;
  prod: string;
  dir: string;
  dp: string;
  town: string;
  weather: string;
  generalCall: string;
  lines: SchedLine[];
  cs: CallSheetData;
  contacts: Contact[];
  showContacts: boolean;
}

function PrintDoc({
  scheduleName, formattedDate, dayStr, projectName, phase,
  prod, dir, dp, town, weather, generalCall,
  lines, cs, contacts, showContacts,
}: PrintDocProps) {
  const local = useLocalEditor();
  const hasKeyInfo = cs.basecamp || cs.parking || cs.hospital || cs.emergency ||
                     cs.mealNotes || cs.safetyNotes || cs.specialInstructions || cs.notes;
  const projectLine = [projectName, phase, dayStr].filter(Boolean).join(' · ');

  const organizationLogo=useCmsStore(s=>s.config.logo);
  return (
    <div className="csh-pdoc">
      {/* Branded header bar */}
      <div className="csh-pdoc-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={organizationLogo||"/logo-header.png"} className="csh-pdoc-logo" alt="Organization logo" />
        <span className="csh-pdoc-brand-title">Call Sheet</span>
      </div>

      {/* Sub-brand: schedule name + project info */}
      {(scheduleName || projectLine) && (
        <div className="csh-pdoc-subbrand">
          {scheduleName && <span className="csh-pdoc-sname">{scheduleName}</span>}
          {projectLine  && <span className="csh-pdoc-pinfo">{projectLine}</span>}
        </div>
      )}

      {/* Production details — only rows with values render */}
      {(prod || dir || dp || formattedDate || town || weather) && (
        <table className="csh-pdoc-meta">
          <tbody>
            {prod          && <tr><td className="csh-pdoc-lbl">Producer</td><td>{prod}</td></tr>}
            {dir           && <tr><td className="csh-pdoc-lbl">Director</td><td>{dir}</td></tr>}
            {dp            && <tr><td className="csh-pdoc-lbl">Camera</td><td>{dp}</td></tr>}
            {formattedDate && <tr><td className="csh-pdoc-lbl">Date</td><td>{formattedDate}</td></tr>}
            {town          && <tr><td className="csh-pdoc-lbl">Location</td><td>{town}</td></tr>}
            {weather       && <tr><td className="csh-pdoc-lbl">Weather</td><td>{weather}</td></tr>}
          </tbody>
        </table>
      )}

      {/* General call */}
      {generalCall && (
        <div className="csh-pdoc-callbox">
          <span className="csh-pdoc-call-lbl">General Call</span>
          <span className="csh-pdoc-call-time">{generalCall}</span>
        </div>
      )}

      {/* Key information — section only renders if at least one field has a value */}
      {hasKeyInfo && (
        <div className="csh-pdoc-section csh-pdoc-section-fixed">
          <div className="csh-pdoc-sh">Key Information</div>
          <table className="csh-pdoc-info">
            <tbody>
              {cs.basecamp            && <tr><td className="csh-pdoc-lbl">Basecamp</td><td>{cs.basecamp}</td></tr>}
              {cs.parking             && <tr><td className="csh-pdoc-lbl">Crew Parking</td><td>{cs.parking}</td></tr>}
              {cs.hospital            && <tr><td className="csh-pdoc-lbl">Nearest Hospital</td><td>{cs.hospital}</td></tr>}
              {cs.emergency           && <tr><td className="csh-pdoc-lbl">Emergency Contact</td><td>{cs.emergency}</td></tr>}
              {cs.mealNotes           && <tr><td className="csh-pdoc-lbl">Meal Notes</td><td style={{ whiteSpace: 'pre-wrap' }}>{cs.mealNotes}</td></tr>}
              {cs.safetyNotes         && <tr><td className="csh-pdoc-lbl">Safety Notes</td><td style={{ whiteSpace: 'pre-wrap' }}>{cs.safetyNotes}</td></tr>}
              {cs.specialInstructions && <tr><td className="csh-pdoc-lbl">Special Instructions</td><td style={{ whiteSpace: 'pre-wrap' }}>{cs.specialInstructions}</td></tr>}
              {cs.notes               && <tr><td className="csh-pdoc-lbl">General Notes</td><td style={{ whiteSpace: 'pre-wrap' }}>{cs.notes}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Contacts */}
      {showContacts && contacts.length > 0 && (
        <div className="csh-pdoc-section csh-pdoc-section-fixed">
          <div className="csh-pdoc-sh">Contacts</div>
          <table className="csh-pdoc-contacts">
            {local && <thead><tr><th>Name / role</th><th>Phone</th><th>Email</th></tr></thead>}
            <tbody>
              {contacts.map((c, i) => (
                <tr key={i}>
                  <td><strong>{c.name || '—'}</strong>{c.title ? ` · ${c.title}` : ''}</td>
                  <td>{c.phone}</td>
                  <td>{c.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule — last, after key info */}
      {lines.length > 0 && (
        <div className="csh-pdoc-section">
          <div className="csh-pdoc-sh">Schedule</div>
          <table className="csh-pdoc-sched">
            {local && <thead><tr><th>Time</th><th>Action</th><th>Location</th></tr></thead>}
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={l.isSun ? 'csh-pdoc-sun' : ''}>
                  <td className="csh-pdoc-td-t">{l.timeIn}</td>
                  <td className="csh-pdoc-td-a">{l.action}</td>
                  <td>{l.loc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Modal ----

interface Props { authorizeOutput?:()=>Promise<boolean>; open: boolean; onClose: () => void; readOnly?: boolean; }

export default function CallSheetModal({ open, onClose, readOnly = false, authorizeOutput }: Props) {

  const rows         = useScheduleStore((s) => s.rows);
  const meta         = useScheduleStore((s) => s.meta);
  const scheduleName = useScheduleStore((s) => s.scheduleName) ?? '';
  const updateMeta   = useScheduleStore((s) => s.updateMeta);

  const local = useLocalEditor();
  const visible = useContext(ModalVisibilityContext);
  const [showContacts, setShowContacts] = useState(false);

  // Reset contacts toggle to OFF each time the modal opens
  useEffect(() => {
    if (open) setShowContacts(false);
  }, [open]);

  const cs          = meta.callsheet ?? {};
  const lines       = buildLines(rows);
  const generalCall = deriveCall(rows);
  const contacts    = documentContacts(rows);
  const weather     = buildWxStr(meta.wx);
  const dayStr      = buildDayStr(meta.dayNumber, meta.totalDays);
  const formattedDate = meta.date
    ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : '';
  const projectLine = [meta.projectName, meta.phase, dayStr].filter(Boolean).join(' · ');

  function commit(key: CSKey, val: string) {
    if (readOnly) return;
    useScheduleStore.getState().pushUndo();
    updateMeta({ callsheet: { ...(meta.callsheet ?? {}), [key]: val } as CallSheetData });
  }

  return (
    <CallSheetReadOnly.Provider value={readOnly}>
      <Modal
        open={open}
        onClose={onClose}
        title="Call Sheet"
        className="csh-modal"
        retainWhenHidden={local}
        footer={
          <>
            <label className="csh-contacts-toggle">
              <input
                type="checkbox"
                checked={showContacts}
                onChange={(e) => setShowContacts(e.target.checked)}
              />
              {' Include contacts'}
            </label>
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={async()=>{if(!authorizeOutput||await authorizeOutput())void printDocument(scheduleName,'callsheet',local);}}
            >
              🖨 Print
            </button>
          </>
        }
      >
        {/* Production header */}
        {(projectLine || meta.prod || meta.dir || meta.dp || formattedDate || meta.town || weather) && (
          <div className="csh-header">
            {/* Project / Phase / Day */}
            {projectLine && (
              <div className="csh-meta-row" style={{ marginBottom: 4 }}>
                <span className="csh-meta-item">
                  <span className="csh-mi-val" style={{ fontWeight: 600 }}>{projectLine}</span>
                </span>
              </div>
            )}
            {/* Producer / Director / Camera */}
            {(meta.prod || meta.dir || meta.dp) && (
              <div className="csh-meta-row">
                {meta.prod && <span className="csh-meta-item"><span className="csh-mi-lbl">Producer</span> <span className="csh-mi-val">{meta.prod}</span></span>}
                {meta.dir  && <span className="csh-meta-item"><span className="csh-mi-lbl">Director</span> <span className="csh-mi-val">{meta.dir}</span></span>}
                {meta.dp   && <span className="csh-meta-item"><span className="csh-mi-lbl">Camera</span> <span className="csh-mi-val">{meta.dp}</span></span>}
              </div>
            )}
            {/* Date / Location */}
            {(formattedDate || meta.town) && (
              <div className="csh-meta-row">
                {formattedDate && <span className="csh-meta-item"><span className="csh-mi-val">{formattedDate}</span></span>}
                {meta.town     && <span className="csh-meta-item"><span className="csh-mi-lbl">Location</span> <span className="csh-mi-val">{meta.town}</span></span>}
              </div>
            )}
            {weather && (
              <div className="csh-meta-row">
                <span className="csh-meta-item"><span className="csh-mi-lbl">Weather</span> <span className="csh-mi-val">{weather}</span></span>
              </div>
            )}
          </div>
        )}

        {/* General call badge */}
        {generalCall && (
          <div className="csh-callbox">
            <span className="csh-call-lbl">General Call</span>
            <span className="csh-call-time">{generalCall}</span>
          </div>
        )}

        {/* Schedule */}
        {lines.length > 0 && (
          <div className="csh-section">
            <div className="csh-sh">Schedule</div>
            <table className="csh-sched-table">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={l.isSun ? 'csh-sun-row' : 'csh-sched-row'}>
                    <td className="csh-td-t">{l.timeIn}</td>
                    <td className="csh-td-a">{l.action}</td>
                    <td className="csh-td-l">{l.loc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Key information */}
        <div className="csh-section">
          <div className="csh-sh">Key Information</div>
          <div className="csh-fields">
            <LocationField label="Basecamp"         fieldKey="basecamp"  value={cs.basecamp  ?? ''} onCommit={commit} />
            <LocationField label="Crew Parking"     fieldKey="parking"   value={cs.parking   ?? ''} onCommit={commit} />
            <LocationField label="Nearest Hospital" fieldKey="hospital"  value={cs.hospital  ?? ''} onCommit={commit} />
            <Field label="Emergency Contact"    fieldKey="emergency"          value={cs.emergency          ?? ''} onCommit={commit} />
            <Notes label="Meal Notes"           fieldKey="mealNotes"          value={cs.mealNotes          ?? ''} onCommit={commit} />
            <Notes label="Safety Notes"         fieldKey="safetyNotes"        value={cs.safetyNotes        ?? ''} onCommit={commit} />
            <Notes label="Special Instructions" fieldKey="specialInstructions" value={cs.specialInstructions ?? ''} onCommit={commit} />
            <Notes label="General Notes"        fieldKey="notes"              value={cs.notes              ?? ''} onCommit={commit} />
          </div>
        </div>

        {/* Contacts (toggle-gated) */}
        {showContacts && (
          <div className="csh-section">
            <div className="csh-sh">Contacts</div>
            {contacts.length === 0 ? (
              <p className="csh-empty">No contacts on this schedule.</p>
            ) : (
              <div className="csh-contacts-list">
                {contacts.map((c, i) => (
                  <div key={i} className="csh-contact-row">
                    <span className="csh-cn">{c.name || <em>Unnamed</em>}</span>
                    {c.title && <span className="csh-ct">{c.title}</span>}
                    {c.phone && <span className="csh-cp">{c.phone}</span>}
                    {c.email && <span className="csh-ce">{c.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Print portal — rendered on document.body, outside modal DOM */}
      {open && visible && typeof document !== 'undefined' && createPortal(
        <div className="callsheet-print-only">
          <PrintDoc
            scheduleName={scheduleName}
            formattedDate={formattedDate}
            dayStr={dayStr}
            projectName={meta.projectName}
            phase={meta.phase}
            prod={meta.prod}
            dir={meta.dir}
            dp={meta.dp}
            town={meta.town}
            weather={weather}
            generalCall={generalCall}
            lines={lines}
            cs={cs}
            contacts={contacts}
            showContacts={showContacts}
          />
        </div>,
        document.body
      )}
    </CallSheetReadOnly.Provider>
  );
}
