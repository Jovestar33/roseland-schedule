'use client';
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredSchedule } from '@/lib/platform/schedule-repository';
import { ScheduleRepositoryError } from '@/lib/platform/schedule-repository';
import { createScheduleFileRepository } from '@/lib/platform/schedule-file-repository';
import { FILE_BYTES, ScheduleFileImport, parseScheduleFile, suggestedSlug, type FileEntry } from '@/lib/platform/schedule-files';
import type { ProductionDestination } from '@/lib/platform/schedule-library';
import type { LifecycleDay } from '@/lib/platform/schedule-lifecycle-repository';
import { safeDownloadName } from '@/lib/document-tools';
import styles from '@/app/local-schedule/local.module.css';
function download(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
interface Props {client:SupabaseClient;actor:string|null;organization:string|null;enabled:boolean;copyEnabled:boolean;getDraft:()=>StoredSchedule['document'];getSource:()=>StoredSchedule|null;name:string;onState:(dirty:boolean,busy:boolean)=>void;requireAuth:()=>void;onCopy?:()=>void}
export default function LocalScheduleFiles({client,actor,organization,enabled,copyEnabled,getDraft,getSource,name,onState,requireAuth,onCopy}:Props){
  const [source,setSource]=useState<{id:string;version:number;policy:string}|null>(null);
  const [repo]=useState(()=>createScheduleFileRepository(client));
  const [entries,setEntries]=useState<FileEntry[]>([]),[days,setDays]=useState<LifecycleDay[]>([]),[day,setDay]=useState('');
  const [productions,setProductions]=useState<ProductionDestination[]>([]),[production,setProduction]=useState('');
  const selectedProduction=productions.find(p=>p.id===production);
  const [review,setReview]=useState<ScheduleFileImport|null>(null),[reviewOrg,setReviewOrg]=useState<string|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[,render]=useState(0);
  const ticket=useRef(0),busyRef=useRef(false),fileRef=useRef<HTMLInputElement>(null);
  const latest=useRef({actor,organization,enabled});latest.current={actor,organization,enabled};
  const inScope=!reviewOrg||reviewOrg===organization;
  useEffect(()=>{onState(entries.length>0||!!review,busy);},[entries.length,review,busy,onState]);
  useEffect(()=>{const requests=ticket;return()=>{requests.current++;};},[]);
  async function run(work:(current:()=>boolean)=>Promise<void>){
    if(busyRef.current||!enabled||!actor)return;busyRef.current=true;setBusy(true);const seq=++ticket.current,a=actor,o=organization;
    const current=()=>seq===ticket.current&&latest.current.actor===a&&latest.current.organization===o&&latest.current.enabled;
    try{await work(current);}catch(e){if(current()){setMessage(e instanceof Error?e.message:'File operation failed.');if(e instanceof ScheduleRepositoryError&&e.kind==='unauthenticated')requireAuth();}}
    finally{if(seq===ticket.current){busyRef.current=false;setBusy(false);render(n=>n+1);}}
  }
  async function loadEntries(next:FileEntry[],current:()=>boolean,copy=false){
    const choices=copy?[]:await repo.productions(actor!,organization!);
    const d=copy?await repo.destinations(actor!,organization!):[];
    if(!current())return;setEntries(next);setReview(null);setReviewOrg(organization);setDays(d);setDay(copy?(d[0]?.id??''):'');setProductions(choices);setProduction(choices[0]?.id??'');
    setMessage((copy?d.length:choices.length)?'Review names, destination and complete documents before importing.':copy?'No existing days are editable by this account.':'No productions allow this account to create schedules.');
  }
  function clear(){setSource(null);setEntries([]);setReview(null);setReviewOrg(null);setMessage('Review closed. Your source draft is unchanged.');if(fileRef.current)fileRef.current.value='';}
  return <section className={styles.files} aria-label="Schedule files">
    <h2>Schedule files</h2>
    <p>Download saved schedules, or import a JSON backup as new schedules. Unsaved edits stay in this tab.</p>
    <details><summary>What the backup includes</summary><p>All saved schedules you can read across organizations, including readable archived and trashed schedules. History, snapshots, templates, organization settings, permissions and browser-only data are excluded.</p></details>
    <div className={styles.toolbar}>
      <button className="btn btn-light" disabled={!enabled||busy} onClick={()=>void run(async current=>{const file=await repo.exportAll(actor!);if(current()){download(file,safeDownloadName('All-authorized-schedules',new Date().toISOString().slice(0,10)+'.json'));setMessage(`Exported ${file.schedules.length} saved schedules. Draft edits were not changed.`);}})}>Export all readable schedules</button>
      <button hidden={!getSource()} className="btn btn-light" disabled={!enabled||!copyEnabled||!organization||busy||entries.length>0||!!review} onClick={()=>{if(onCopy){onCopy();return;}const data=structuredClone(getDraft()),record=getSource();if(!record)return;void run(async current=>{const policy=await repo.copyPolicy(actor!,record.id);if(!current())return;setSource({id:record.id,version:record.document_version,policy});await loadEntries([{name:`${name} copy`,slug:suggestedSlug(`${name} copy`),data}],current,true);});}}>Copy / Save As current draft</button>
      <label>Import schedule-only JSON<input ref={fileRef} type="file" accept=".json,application/json" disabled={!enabled||!organization||busy||entries.length>0||!!review} onChange={e=>{const file=e.target.files?.[0];if(!file)return;void run(async current=>{if(file.size>FILE_BYTES)throw new Error('File exceeds 20 MB.');setSource(null);setMessage(`Reading ${file.name}…`);const contents=await file.text();const next=await parseScheduleFile(contents,file.name.replace(/\.json$/i,''));await loadEntries(next,current);});e.target.value='';}}/></label>
    </div>
    <p role="status">{message}</p>
    {!inScope&&<p>A file review is retained in another organization. Return there to continue.</p>}
    {inScope&&entries.length>0&&!review&&<fieldset disabled={!enabled||busy}>
      <legend>Review new schedules — no writes yet</legend>
      <p>All items become new drafts in the selected production. A production day is optional for file imports. Imported schedules start as new drafts. Schedule fields stay exactly as supplied. Existing schedules are never overwritten.</p>
      {!source&&<label>Destination production<select value={production} onChange={e=>{setProduction(e.target.value);setDay('');}}><option value="">Choose a production</option>{productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <label>Destination production day<select value={day} onChange={e=>setDay(e.target.value)}><option value="">{source?'Choose an editable day':'No production day'}</option>{source?days.map(d=><option key={d.id} value={d.id}>{d.label}</option>):selectedProduction?.days.map(d=><option key={d.id} value={d.id}>Day {d.number??d.position+1}{d.date?' · '+d.date:''}</option>)}</select></label>
      {entries.map((entry,i)=><div key={i} className={styles.fileEntry}>
        <label>New schedule name {i+1}<input value={entry.name} onChange={e=>setEntries(all=>all.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/></label>
        <label>New schedule slug {i+1}<input value={entry.slug} onChange={e=>setEntries(all=>all.map((v,j)=>j===i?{...v,slug:e.target.value}:v))}/></label>
        <details><summary>Review full document {i+1} ({entry.data.rows?.length??0} rows)</summary><pre>{JSON.stringify(entry.data,null,2)}</pre></details>
      </div>)}
      <button className="btn btn-primary" disabled={source?!day:!selectedProduction} onClick={()=>void run(async current=>{const placement=source?undefined:{productionId:production,phaseId:null};const proposed=new ScheduleFileImport(actor!,organization!,day||null,entries,undefined,placement);await repo.preflight(actor!,organization!,day||null,entries,placement);if(current()){setReview(proposed);setMessage('Review locked. Confirm to create these exact documents; later source edits remain in your draft.');}})}>Prepare create-only review</button>
      <button className="btn btn-light" onClick={clear}>Cancel review</button>
    </fieldset>}
    {inScope&&review&&<div className={styles.recovery}>
      <h3>{review.complete?'New schedules confirmed':'Confirm or recover creation'}</h3>
      <p>Destination: {review.placement?`${productions.find(p=>p.id===review.placement!.productionId)?.name??'Selected production'} · ${review.day?'Selected production day':'No production day'}`:days.find(d=>d.id===review.day)?.label}. {review.items.filter(c=>c.phase==='success').length} of {review.items.length} confirmed. Keep this tab for recovery; closing or reloading loses request details. Download the receipt to retain IDs.</p>
      <ul>{review.receipt().map(r=><li key={r.id}>{r.name} · {r.state}{r.failure?` (${r.failure})`:''}<br/><small>{r.id}</small></li>)}</ul>
      <button className="btn btn-primary" disabled={!enabled||busy||review.complete} onClick={()=>void run(async current=>{await review.execute({...repo.lifecycle,send:attempt=>repo.lifecycle.send(attempt,source??undefined),probe:attempt=>repo.lifecycle.probe(attempt,source??undefined)},current);if(current()){setMessage(review.complete?'Creation confirmed. Source and newer draft edits are unchanged.':'Stopped at an unconfirmed item. Check the original IDs before retrying.');if(review.items.some(c=>c.failure==='unauthenticated'))requireAuth();}})}>{review.started?'Retry unconfirmed original IDs':'Confirm create new schedules'}</button>
      {review.started&&!review.complete&&<button className="btn btn-light" disabled={!enabled||busy} onClick={()=>void run(async current=>{await review.execute({...repo.lifecycle,send:attempt=>repo.lifecycle.send(attempt,source??undefined),probe:attempt=>repo.lifecycle.probe(attempt,source??undefined)},current,true);if(current())setMessage('Original IDs checked. Review the recorded results.');})}>Check original IDs</button>}
      <button className="btn btn-light" disabled={busy} onClick={()=>download({format:'schedule-create-receipt',fictional:true,items:review.receipt()},safeDownloadName('Schedule-create','receipt.json'))}>Download creation receipt</button>
      {(!review.started||review.complete)&&<button className="btn btn-light" disabled={busy} onClick={clear}>{review.complete?'Close completed review':'Cancel review'}</button>}
    </div>}
  </section>;
}
