'use client';
import {useCmsStore} from '@/lib/store/cmsStore';
import { useCallback, useState, useEffect, useRef, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import Modal, { ModalVisibilityContext } from './Modal';
import {useDocumentOutput} from './useDocumentOutput';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';
import { useDocumentProviders } from '@/components/local/DocumentProvidersContext';
import { documentContacts } from '@/lib/document-tools';
import { printDocument } from '@/lib/print';
import DocumentPrintFurniture from './DocumentPrintFurniture';
import { dateLabel } from '@/lib/date-label';
const CallSheetReadOnly = createContext(false);
import PlacesAutocomplete from '@/components/schedule/PlacesAutocomplete';
import ProductionContacts,{ProductionContactGroups} from '@/components/local/ProductionContacts';
import type {ProductionContact} from '@/lib/types';
import CallSheetPrintPreview,{type CallSheetPrintRequest} from '@/components/print/CallSheetPrintPreview';
import CallSheetPublishing from '@/components/local/CallSheetPublishing';
import {useCallSheetPublishing} from '@/components/local/CallSheetPublishingContext';
import type {ScheduleData} from '@/lib/types';
import type { CallSheetData } from '@/lib/types';
import {m12,t12m} from '@/lib/time';
import { callSheetCall, callSheetLines, callSheetWeather, callSheetOverview, callSheetChecks, type CallSheetLine } from '@/lib/call-sheet';

// ---- Derived-data helpers ----

interface Contact { name: string; title: string; phone: string; email: string; }

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

function TimeField({label,fieldKey,value,onCommit}:{label:string;fieldKey:CSKey;value:string;onCommit:(key:CSKey,value:string)=>void}) {
 const readOnly=useContext(CallSheetReadOnly),minutes=t12m(value);
 const clock=minutes<0?'':`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
 return <div className="csh-field"><span className="csh-fl">{label}</span>{readOnly?<strong className="csh-fv">{value||'Not set'}</strong>:<input className="csh-time-input" aria-label={label} type="time" value={clock} onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);onCommit(fieldKey,e.target.value?m12(h*60+m):'');}}/>}</div>;
}
function TimeZoneField({value,onCommit}:{value:string;onCommit:(key:CSKey,value:string)=>void}) {
 const readOnly=useContext(CallSheetReadOnly);
 const zones=Intl.supportedValuesOf('timeZone');
 return <div className="csh-field"><span className="csh-fl">Local time zone</span>{readOnly?<span>{value||'Not set'}</span>:<select aria-label="Local time zone" className="csh-fi" value={value} onChange={e=>onCommit('timeZone',e.target.value)}><option value="">Choose time zone…</option>{value&&!zones.includes(value)&&<option>{value}</option>}{zones.map(z=><option key={z}>{z}</option>)}</select>}</div>;
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
  weather: string[];
  generalCall: {label: string; time: string};
  lines: CallSheetLine[];
  cs: CallSheetData;
  contacts: Contact[];
  showContacts: boolean;
  productionContacts: ProductionContact[];
  enhanced: boolean;
  fullDetails?: boolean;
  overview?: ReturnType<typeof callSheetOverview>;
  onContactsState?:(dirty:boolean,busy:boolean)=>void;
  contactCloseNotice?:boolean;
}

/** One content order for the editable view and its read-only print portal. */
function CallSheetDocument({
  scheduleName, formattedDate, dayStr, projectName, phase, prod, dir, dp,
  town, weather, generalCall, lines, cs, contacts, showContacts, productionContacts = [], enhanced = false,
  print = false, onCommit, fullDetails = true, overview, onContactsState, contactCloseNotice,
}: PrintDocProps & {print?: boolean; onCommit: (key: CSKey, value: string) => void}) {
  const organizationLogo = useCmsStore(s => s.config.logo);
  const readOnly = useContext(CallSheetReadOnly);
  return <div className={`csh-document${print ? ' csh-pdoc' : ''}`}>
    <header className="csh-masthead">
      <div className="csh-identity-grid">
        <div className="csh-production">
          <div className="csh-brand-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="csh-logo" src={organizationLogo && organizationLogo !== '/logo-header.png' ? organizationLogo : '/logo-call-sheet.png'} alt="Organization logo" />
            <div><span className="csh-kicker">Call Sheet</span><h1>{projectName || scheduleName || 'Production'}</h1></div>
          </div>
          {projectName && scheduleName && <p className="csh-schedule-name">{scheduleName}</p>}
          {phase && <p className="csh-phase">{phase}</p>}
        </div>
        <div className="csh-callbox"><span className="csh-call-lbl">{generalCall.label}</span>
          <strong className="csh-call-time">{generalCall.time || 'Not set'}</strong>
          <p className="csh-date">{formattedDate || 'Date not set'}</p>
          {dayStr && <p className="csh-day">{dayStr}</p>}
        </div>
      </div>
      {(prod || dir || dp || town || weather.length > 0) && <div className="csh-summary-grid">
        {(prod || dir || dp) && <div className="csh-team">
          {prod && <p className="csh-detail"><span>Producer</span>{prod}</p>}
          {dir && <p className="csh-detail"><span>Director</span>{dir}</p>}
          {dp && <p className="csh-detail"><span>Camera</span>{dp}</p>}
        </div>}
        {(town || weather.length > 0) && <div className="csh-conditions">
          {town && <p className="csh-town">{town}</p>}
          {weather.length > 0 && <p className="csh-weather">{weather.join(' · ')}</p>}
        </div>}
      </div>}
    </header>
    {!print && !readOnly && <p className="csh-edit-help">Edit details below, then save your schedule. Use Print to review or save a PDF.</p>}
    {enhanced&&<section className="csh-section csh-overview" id={print?undefined:'csh-overview'} aria-label="Day at a glance">
      <h2 className="csh-sh">Day at a glance</h2>
      <div className="csh-day-times"><TimeField label="Crew call" fieldKey="crewCall" value={cs.crewCall||overview?.crewCall||''} onCommit={onCommit}/><TimeField label="First filming" fieldKey="firstShot" value={cs.firstShot||overview?.firstShot||''} onCommit={onCommit}/><TimeField label="Meal" fieldKey="mealTime" value={cs.mealTime||overview?.mealTime||''} onCommit={onCommit}/><TimeField label="Estimated wrap" fieldKey="estimatedWrap" value={cs.estimatedWrap||overview?.estimatedWrap||''} onCommit={onCommit}/></div>
      {!print&&!readOnly&&<p className="csh-edit-help">Times follow the schedule unless you enter an override here.</p>}
      <div className="csh-report-grid"><div><LocationField label="First reporting location / address" fieldKey="reportLocation" value={cs.reportLocation??''} onCommit={onCommit}/>{(!print||cs.reportInstructions)&&<Notes label="Entrance / arrival instructions" fieldKey="reportInstructions" value={cs.reportInstructions??''} onCommit={onCommit}/>}</div><div><Field label="On-set contact" fieldKey="primaryContact" value={cs.primaryContact??''} onCommit={onCommit}/><Field label="On-set phone" fieldKey="primaryPhone" value={cs.primaryPhone??''} onCommit={onCommit}/><TimeZoneField value={cs.timeZone??''} onCommit={onCommit}/></div></div>
    </section>}
    {(!print || cs.basecamp || cs.parking || cs.hospital || cs.emergency || cs.productionOffice || cs.hospitalPhone || cs.hospitalNotes) && <section className="csh-section" id={print?undefined:'csh-arrival'}>
      <h2 className="csh-sh">Arrival &amp; parking</h2>
      <div className="csh-logistics-grid">
        <div className="csh-fields">
          {enhanced&&(!print||cs.productionOffice)&&<Field label="Production office / contact" fieldKey="productionOffice" value={cs.productionOffice??''} onCommit={onCommit}/>}
          {(!print || cs.basecamp) && <LocationField label="Basecamp" fieldKey="basecamp" value={cs.basecamp ?? ''} onCommit={onCommit} />}
          {(!print || cs.parking) && <LocationField label="Crew Parking" fieldKey="parking" value={cs.parking ?? ''} onCommit={onCommit} />}
        </div>
        <div className="csh-fields csh-emergency">
          <h3>Hospital &amp; emergency</h3>
          {(!print || cs.hospital) && <LocationField label="Nearest Hospital" fieldKey="hospital" value={cs.hospital ?? ''} onCommit={onCommit} />}
          {enhanced&&(!print||cs.hospitalPhone)&&<Field label="Hospital phone" fieldKey="hospitalPhone" value={cs.hospitalPhone??''} onCommit={onCommit}/>}
          {enhanced&&(!print||cs.hospitalNotes)&&<Notes label="Hospital / emergency directions" fieldKey="hospitalNotes" value={cs.hospitalNotes??''} onCommit={onCommit}/>}
          {(!print || cs.emergency) && <Field label="Emergency Contact" fieldKey="emergency" value={cs.emergency ?? ''} onCommit={onCommit} />}
        </div>
      </div>
    </section>}
    {(!print || cs.safetyNotes || cs.specialInstructions) && <section className="csh-section csh-bulletin" id={print?undefined:'csh-safety'}>
      <h2 className="csh-sh">Safety &amp; instructions</h2>
      <div className="csh-bulletin-grid">
        {(!print || cs.safetyNotes) && <Notes label="Safety Notes" fieldKey="safetyNotes" value={cs.safetyNotes ?? ''} onCommit={onCommit} />}
        {(!print || cs.specialInstructions) && <Notes label="Special Instructions" fieldKey="specialInstructions" value={cs.specialInstructions ?? ''} onCommit={onCommit} />}
      </div>
    </section>}
    {enhanced&&(!print||productionContacts.some(c=>c.type==='crew'||c.type==='cast'))&&<section className="csh-section" id={print?undefined:'csh-people'}><h2 className="csh-sh">Crew &amp; cast calls</h2>
      <ProductionContactGroups contacts={productionContacts.filter(c=>c.type==='crew'||c.type==='cast')} showPrivate={showContacts}/>
      {!productionContacts.some(c=>c.type==='crew'||c.type==='cast')&&!print&&<p className="csh-empty">Add crew and cast contacts below to include individual call times.</p>}
      {!print&&!readOnly&&<details className="pc-manage"><summary>Add or edit people &amp; individual calls</summary><ProductionContacts onState={onContactsState} closeNotice={contactCloseNotice}/></details>}
    </section>}
    <section className="csh-section" id={print?undefined:'csh-schedule'}>
      <h2 className="csh-sh">Day schedule</h2>
      {lines.length ? <table className="csh-sched-table csh-pdoc-sched">
        <colgroup><col className="csh-time-col" /><col /><col className="csh-location-col" /></colgroup>
        <thead><tr><th scope="col">Time</th><th scope="col">Activity / details</th><th scope="col">Location</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i} className={`${l.isSun ? 'csh-sun-row' : 'csh-sched-row'}${l.long ? ' csh-long-row' : ''}`}>
          <td className="csh-td-t">{l.timeIn}</td>
          <td className="csh-td-a"><strong>{l.action}</strong>
            {fullDetails && l.description && <span className="csh-work-description">{l.description}</span>}
            {l.keyInstruction && <span className="csh-work-notes"><strong>Key instruction: {l.keyInstruction}</strong></span>}
            {l.cast && <span className="csh-work-notes"><b>Cast: </b>{l.cast}</span>}
            {l.notes && <span className="csh-work-notes"><b>Notes: </b>{l.notes}</span>}
          </td>
          <td className="csh-td-l">{l.locations.map((loc, j) => <div className="csh-work-location" key={j}>
            {loc.name && <span>{loc.name}</span>}{loc.address && <span className="csh-address">{loc.address}</span>}
            {loc.description && <span className="csh-location-description">{loc.description}</span>}
          </div>)}</td>
        </tr>)}</tbody>
      </table> : <p className="csh-empty">No scheduled activity.</p>}
    </section>
    {(!print || cs.mealNotes || cs.mealLocation || cs.mealContact || cs.mealHeadcount) && <section className="csh-section" id={print?undefined:'csh-meals'}>
      <h2 className="csh-sh">Meals</h2><div className="csh-logistics-grid"><div>
        {enhanced&&(!print||cs.mealLocation)&&<LocationField label="Meal location" fieldKey="mealLocation" value={cs.mealLocation??''} onCommit={onCommit}/>}
        {(!print||cs.mealNotes)&&<Notes label="Meal notes" fieldKey="mealNotes" value={cs.mealNotes??''} onCommit={onCommit}/>}</div><div>
        {enhanced&&(!print||cs.mealContact)&&<Field label="Catering contact" fieldKey="mealContact" value={cs.mealContact??''} onCommit={onCommit}/>}
        {enhanced&&(!print||cs.mealHeadcount)&&<Field label="Expected headcount" fieldKey="mealHeadcount" value={cs.mealHeadcount??''} onCommit={onCommit}/>}</div></div>
    </section>}
    {(!print||cs.notes||cs.departmentNotes||cs.walkieChannels||cs.advanceSchedule)&&<section className="csh-section" id={print?undefined:'csh-notes'}><h2 className="csh-sh">Notes &amp; next day</h2><div className="csh-bulletin-grid"><div>
      {(!print||cs.notes)&&<Notes label="General notes" fieldKey="notes" value={cs.notes??''} onCommit={onCommit}/>}
      {enhanced&&(!print||cs.departmentNotes)&&<Notes label="Department notes" fieldKey="departmentNotes" value={cs.departmentNotes??''} onCommit={onCommit}/>}
      {enhanced&&(!print||cs.walkieChannels)&&<Notes label="Walkie channels" fieldKey="walkieChannels" value={cs.walkieChannels??''} onCommit={onCommit}/>}</div><div>
      {enhanced&&(!print||cs.advanceSchedule)&&<Notes label="Next day / advance notes" fieldKey="advanceSchedule" value={cs.advanceSchedule??''} onCommit={onCommit}/>}</div></div>
    </section>}
    {enhanced&&(!print||cs.preparedBy||cs.revisionNotes)&&<section className="csh-section csh-prepared"><h2 className="csh-sh">Prepared by &amp; changes</h2><Field label="Prepared by" fieldKey="preparedBy" value={cs.preparedBy??''} onCommit={onCommit}/>{(!print||cs.revisionNotes)&&<Notes label="Changes for this version" fieldKey="revisionNotes" value={cs.revisionNotes??''} onCommit={onCommit}/>}</section>}
    {enhanced&&showContacts&&<ProductionContactGroups contacts={productionContacts.filter(c=>c.type!=='crew'&&c.type!=='cast')} showPrivate/>}
    {showContacts && (!print||contacts.length>0||!enhanced) && <section className="csh-section">
      <h2 className="csh-sh">Schedule contacts</h2>
      {contacts.length ? <table className="csh-contacts-table csh-pdoc-contacts">
        <thead><tr><th scope="col">Name / role</th><th scope="col">Phone</th><th scope="col">Email</th></tr></thead>
        <tbody>{contacts.map((c, i) => <tr key={i}>
          <td><strong>{c.name || 'Unnamed'}</strong>{c.title && <span className="csh-contact-role">{c.title}</span>}</td>
          <td>{c.phone}</td><td>{c.email}</td>
        </tr>)}</tbody>
      </table> : <p className="csh-empty">No contacts attached to schedule actions.</p>}
    </section>}
  </div>;
}

// ---- Modal ----

interface Props { authorizeOutput?:()=>Promise<boolean>; open: boolean; onClose: () => void; readOnly?: boolean; }

export default function CallSheetModal({ open, onClose, readOnly = false, authorizeOutput }: Props) {

  const rows         = useScheduleStore((s) => s.rows);
  const meta         = useScheduleStore((s) => s.meta);
  const scheduleName = useScheduleStore((s) => s.scheduleName) ?? '';
  const documentSession = useScheduleStore((s) => s.documentSession);
  const updateMeta   = useScheduleStore((s) => s.updateMeta);

  const local = useLocalEditor();
  const publishing=useCallSheetPublishing();
  const visible = useContext(ModalVisibilityContext);
  const output=useDocumentOutput({open,visible,identity:`${documentSession}:${scheduleName}`,authorize:authorizeOutput});
  const [showContacts, setShowContacts] = useState(false);
  const [fullDetails,setFullDetails]=useState(true);
  const [contactState,setContactState]=useState({dirty:false,busy:false});
  const [closeNotice,setCloseNotice]=useState(false);
  const reportContacts=useCallback((dirty:boolean,busy:boolean)=>setContactState({dirty,busy}),[]);
  const [printRequest,setPrintRequest]=useState<CallSheetPrintRequest|null>(null);
  useEffect(()=>{setPrintRequest(null);},[open,visible,documentSession]);

  // Reset contacts toggle to OFF each time the modal opens
  useEffect(() => {
    if (open) setShowContacts(false);
  }, [open]);

  const cs          = meta.callsheet ?? {};
  const lines       = callSheetLines(rows);
  const generalCall = cs.crewCall ? {label:'Crew Call',time:cs.crewCall} : callSheetCall(rows);
  const overview = callSheetOverview(rows);
  const checks=callSheetChecks(meta,rows);
  const contacts    = documentContacts(rows);
  const weather     = callSheetWeather(meta.wx);
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
        onClose={()=>{output.cancel();onClose();}}
        title="Call Sheet"
        className="csh-modal"
        retainWhenHidden={local}
        beforeClose={()=>{if(local&&(contactState.dirty||contactState.busy)){setCloseNotice(true);return false;}return true;}}
        footer={
          <>
            <label className="csh-contacts-toggle">
              <input
                type="checkbox"
                checked={showContacts}
                onChange={(e) => setShowContacts(e.target.checked)}
              />
              {' Include contact details'}
            </label>
            {local&&<label className="csh-contacts-toggle"><input type="checkbox" checked={fullDetails} onChange={e=>setFullDetails(e.target.checked)}/> Full shooting descriptions</label>}
            <button
              type="button"
              className="btn btn-light btn-sm"
              disabled={output.busy}
              onClick={()=>void output.run(current=>{if(local)setPrintRequest({name:scheduleName,data:structuredClone(useScheduleStore.getState().getScheduleData()),options:{contacts:showContacts,details:fullDetails}});else return printDocument(scheduleName,'callsheet',false,current);})}
            >
              🖨 Print
            </button>
            {output.busy&&<span role="status">Preparing document…</span>}
            {output.error&&<p role="alert">{output.error}</p>}
          </>
        }
      >
        {local&&<><nav className="csh-section-nav" aria-label="Call sheet sections">{[['overview','Overview'],['arrival','Arrival & parking'],['safety','Safety'],['people','People & calls'],['schedule','Schedule'],['meals','Meals'],['notes','Notes & next day'],...(publishing?[["issue","Issue & share"]]:[])].map(([id,label])=><button type="button" key={id} onClick={()=>document.getElementById('csh-'+id)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>{label}</button>)}</nav>{!readOnly&&checks.length>0&&<details className="csh-readiness"><summary>{checks.length} {checks.length===1?'detail':'details'} to review before sharing</summary><ul>{checks.map(check=><li key={check}>{check}</li>)}</ul></details>}</>}
        <CallSheetDocument onContactsState={reportContacts} contactCloseNotice={closeNotice} fullDetails={fullDetails} overview={overview} scheduleName={scheduleName} formattedDate={formattedDate} dayStr={dayStr}
          projectName={meta.projectName} phase={meta.phase} prod={meta.prod} dir={meta.dir} dp={meta.dp}
          town={meta.town} weather={weather} generalCall={generalCall} lines={lines} cs={cs}
          contacts={contacts} showContacts={showContacts} productionContacts={meta.productionContacts??[]} enhanced={local} onCommit={commit} />
        {local&&publishing&&<CallSheetPublishing includeContacts={showContacts} fullDetails={fullDetails} checks={checks} renderEdition={value=><IssuedCallSheet value={value}/>}/>}
      </Modal>

      {open&&visible&&printRequest&&<CallSheetPrintPreview request={printRequest} onClose={()=>setPrintRequest(null)} authorize={authorizeOutput}/>}
      {/* Print portal — rendered on document.body, outside modal DOM */}
      {open && visible && typeof document !== 'undefined' && createPortal(
        <div className="callsheet-print-only">
          <DocumentPrintFurniture name={scheduleName} date={formattedDate} kind="Call Sheet" />
          <CallSheetReadOnly.Provider value={true}>
            <CallSheetDocument print fullDetails={fullDetails} overview={overview} scheduleName={scheduleName} formattedDate={formattedDate} dayStr={dayStr}
          projectName={meta.projectName} phase={meta.phase} prod={meta.prod} dir={meta.dir} dp={meta.dp}
          town={meta.town} weather={weather} generalCall={generalCall} lines={lines} cs={cs}
          contacts={contacts} showContacts={showContacts} productionContacts={meta.productionContacts??[]} enhanced={local} onCommit={commit} />
          </CallSheetReadOnly.Provider>
        </div>,
        document.body
      )}
    </CallSheetReadOnly.Provider>
  );
}

export interface IssuedCallSheetData {name:string;document:ScheduleData;edition:number;created_at:string;include_contacts:boolean;full_details:boolean;acknowledged?:boolean;recipient?:boolean}
export function IssuedCallSheet({value}:{value:IssuedCallSheetData}){
 const {meta,rows}=value.document,cs=meta.callsheet??{};
 return <CallSheetReadOnly.Provider value={true}><div className="csh-issued-stamp"><strong>{value.edition===1?'Issued':'Revised'} · Version {value.edition}</strong><span>{new Date(value.created_at).toLocaleString()}</span></div><CallSheetDocument scheduleName={value.name} formattedDate={dateLabel(meta.date)} dayStr={buildDayStr(meta.dayNumber,meta.totalDays)} projectName={meta.projectName} phase={meta.phase} prod={meta.prod} dir={meta.dir} dp={meta.dp} town={meta.town} weather={callSheetWeather(meta.wx)} generalCall={cs.crewCall?{label:'Crew Call',time:cs.crewCall}:callSheetCall(rows)} lines={callSheetLines(rows)} cs={cs} contacts={documentContacts(rows)} showContacts={value.include_contacts} productionContacts={meta.productionContacts??[]} enhanced fullDetails={value.full_details} overview={callSheetOverview(rows)} onCommit={()=>{}} print/></CallSheetReadOnly.Provider>;
}
