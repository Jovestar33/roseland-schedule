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
import DocumentPrintFurniture from './DocumentPrintFurniture';
import { dateLabel } from '@/lib/date-label';
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
          {value || 'Add details…'}
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
              {value || 'Add details…'}
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
          onClick={edit.start} style={{whiteSpace:'pre-wrap'}}>{value || 'Add notes…'}</button>
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

/** One content order for the editable view and its read-only print portal. */
function CallSheetDocument({
  scheduleName, formattedDate, dayStr, projectName, phase, prod, dir, dp,
  town, weather, generalCall, lines, cs, contacts, showContacts,
  print = false, onCommit,
}: PrintDocProps & {print?: boolean; onCommit: (key: CSKey, value: string) => void}) {
  const organizationLogo = useCmsStore(s => s.config.logo);
  const projectLine = [projectName, phase, dayStr].filter(Boolean).join(' · ');
  return <div className={`csh-document${print ? ' csh-pdoc' : ''}`}>
    {print && <div className="csh-document-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={organizationLogo || '/logo-header.png'} alt="Organization logo" />
      <span>Call Sheet</span>
    </div>}
    <header className="csh-identity-grid">
      <div><h1>{scheduleName || 'Call Sheet'}</h1>
        {projectLine && <p className="csh-project">{projectLine}</p>}
        <p className="csh-date">{formattedDate || 'Date not set'}</p>
      </div>
      <div className="csh-callbox"><span className="csh-call-lbl">General Call</span>
        <strong className="csh-call-time">{generalCall || 'Not set'}</strong>
      </div>
    </header>
    {(town || weather) && <section className="csh-section">
      <h2 className="csh-sh">Location &amp; weather</h2>
      {town && <p className="csh-detail"><span>Location</span>{town}</p>}
      {weather && <p className="csh-detail"><span>Weather</span>{weather}</p>}
    </section>}
    {(!print || cs.basecamp || cs.parking || cs.hospital || cs.emergency) && <section className="csh-section">
      <h2 className="csh-sh">Arrival &amp; emergency</h2>
      <div className="csh-fields">
        {(!print || cs.basecamp) && <LocationField label="Basecamp" fieldKey="basecamp" value={cs.basecamp ?? ''} onCommit={onCommit} />}
        {(!print || cs.parking) && <LocationField label="Crew Parking" fieldKey="parking" value={cs.parking ?? ''} onCommit={onCommit} />}
        {(!print || cs.hospital) && <LocationField label="Nearest Hospital" fieldKey="hospital" value={cs.hospital ?? ''} onCommit={onCommit} />}
        {(!print || cs.emergency) && <Field label="Emergency Contact" fieldKey="emergency" value={cs.emergency ?? ''} onCommit={onCommit} />}
      </div>
    </section>}
    <section className="csh-section">
      <h2 className="csh-sh">Day schedule</h2>
      {lines.length ? <table className="csh-sched-table csh-pdoc-sched">
        <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Location</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i} className={l.isSun ? 'csh-sun-row' : 'csh-sched-row'}>
          <td className="csh-td-t">{l.timeIn}</td><td className="csh-td-a">{l.action}</td><td className="csh-td-l">{l.loc}</td>
        </tr>)}</tbody>
      </table> : <p className="csh-empty">No scheduled activity.</p>}
    </section>
    {(!print || prod || dir || dp || cs.mealNotes || cs.safetyNotes || cs.specialInstructions || cs.notes) && <section className="csh-section">
      <h2 className="csh-sh">Production notes &amp; team</h2>
      <div className="csh-fields">
        {(!print || cs.mealNotes) && <Notes label="Meal Notes" fieldKey="mealNotes" value={cs.mealNotes ?? ''} onCommit={onCommit} />}
        {(!print || cs.safetyNotes) && <Notes label="Safety Notes" fieldKey="safetyNotes" value={cs.safetyNotes ?? ''} onCommit={onCommit} />}
        {(!print || cs.specialInstructions) && <Notes label="Special Instructions" fieldKey="specialInstructions" value={cs.specialInstructions ?? ''} onCommit={onCommit} />}
        {(!print || cs.notes) && <Notes label="General Notes" fieldKey="notes" value={cs.notes ?? ''} onCommit={onCommit} />}
      </div>
      {(prod || dir || dp) && <div className="csh-team">
        {prod && <p className="csh-detail"><span>Producer</span>{prod}</p>}
        {dir && <p className="csh-detail"><span>Director</span>{dir}</p>}
        {dp && <p className="csh-detail"><span>Camera</span>{dp}</p>}
      </div>}
    </section>}
    {showContacts && <section className="csh-section">
      <h2 className="csh-sh">Contacts</h2>
      {contacts.length ? <table className="csh-contacts-table csh-pdoc-contacts">
        <thead><tr><th scope="col">Name / role</th><th scope="col">Phone</th><th scope="col">Email</th></tr></thead>
        <tbody>{contacts.map((c, i) => <tr key={i}>
          <td><strong>{c.name || 'Unnamed'}</strong>{c.title && <span className="csh-contact-role">{c.title}</span>}</td>
          <td>{c.phone}</td><td>{c.email}</td>
        </tr>)}</tbody>
      </table> : <p className="csh-empty">No contacts on this schedule.</p>}
    </section>}
  </div>;
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
  const formattedDate = dateLabel(meta.date) !== 'Date not set'
    ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : '';
  

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
        <CallSheetDocument scheduleName={scheduleName} formattedDate={formattedDate} dayStr={dayStr}
          projectName={meta.projectName} phase={meta.phase} prod={meta.prod} dir={meta.dir} dp={meta.dp}
          town={meta.town} weather={weather} generalCall={generalCall} lines={lines} cs={cs}
          contacts={contacts} showContacts={showContacts} onCommit={commit} />
      </Modal>

      {/* Print portal — rendered on document.body, outside modal DOM */}
      {open && visible && typeof document !== 'undefined' && createPortal(
        <div className="callsheet-print-only">
          <DocumentPrintFurniture name={scheduleName} date={formattedDate} kind="Call Sheet" />
          <CallSheetReadOnly.Provider value={true}>
            <CallSheetDocument print scheduleName={scheduleName} formattedDate={formattedDate} dayStr={dayStr}
          projectName={meta.projectName} phase={meta.phase} prod={meta.prod} dir={meta.dir} dp={meta.dp}
          town={meta.town} weather={weather} generalCall={generalCall} lines={lines} cs={cs}
          contacts={contacts} showContacts={showContacts} onCommit={commit} />
          </CallSheetReadOnly.Provider>
        </div>,
        document.body
      )}
    </CallSheetReadOnly.Provider>
  );
}
