 'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createTransferRepository,captureTransfer,type TransferAttempt,type TransferDestination,type TransferRequest,type TransferReview} from '@/lib/platform/schedule-transfers';
import {createScheduleLibraryRepository,type ProductionDestination} from '@/lib/platform/schedule-library';
import {createLifecycleRepository} from '@/lib/platform/schedule-lifecycle-repository';
import {suggestedSlug,validateFileName,validateFileDocument} from '@/lib/platform/schedule-files';
import type {StoredSchedule} from '@/lib/platform/schedule-repository';
import type {ScheduleData} from '@/lib/types';
import {makeMeta} from '@/lib/rowNormalizer';
import ScheduleReadView from '@/components/view/ScheduleReadView';
import styles from '@/app/local-workspace/workspace.module.css';
import transferStyles from './transfers.module.css';
type Props={client:SupabaseClient;actor:string|null;organization:string|null;enabled:boolean;request:{id:string;copy:boolean;sequence:number}|null;onState:(dirty:boolean,busy:boolean)=>void;getDraft:(id:string)=>{record:StoredSchedule;document:StoredSchedule['document']}|null;captureOpen:()=>unknown;onCopy:(id:string,context:unknown)=>Promise<boolean>};
export default function LocalScheduleTransfers({client,actor,organization,enabled,request,onState,getDraft,captureOpen,onCopy}:Props){
 const [repo]=useState(()=>createTransferRepository(client)),[library]=useState(()=>createScheduleLibraryRepository(client)),[lifecycle]=useState(()=>createLifecycleRepository(client));
 const [inbox,setInbox]=useState<TransferRequest[]>([]),[source,setSource]=useState<StoredSchedule|null>(null),[choices,setChoices]=useState<TransferDestination[]>([]),[placements,setPlacements]=useState<ProductionDestination[]>([]);
 const [mode,setMode]=useState<'move'|'copy'|'approve'>('move'),[destination,setDestination]=useState(''),[phase,setPhase]=useState(''),[day,setDay]=useState(''),[name,setName]=useState(''),[slug,setSlug]=useState('');
 const [preview,setPreview]=useState<TransferReview|null>(null),[incoming,setIncoming]=useState<TransferRequest|null>(null),[attempt,setAttempt]=useState<TransferAttempt|null>(null),[complete,setComplete]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[scope,setScope]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),busyRef=useRef(false),generation=useRef(0),latest=useRef({actor,organization,enabled}),context=useRef<unknown>(null),draft=useRef<ReturnType<Props['getDraft']>>(null);
 latest.current={actor,organization,enabled};const scopeKey=actor+':'+organization,inScope=scope===scopeKey;
 useEffect(()=>{generation.current++;if(!enabled)setPreview(null);},[actor,organization,enabled]);
 useEffect(()=>{onState(!!source||!!attempt,busy);},[source,attempt,busy,onState]);
 useEffect(()=>{if(source&&inScope&&enabled)dialog.current?.showModal();else dialog.current?.close();},[source,inScope,enabled]);
 const current=(g:number)=>generation.current===g&&latest.current.actor===actor&&latest.current.organization===organization&&latest.current.enabled;
 async function run(work:(g:number)=>Promise<void>){if(!actor||!organization||!enabled||busyRef.current)return;busyRef.current=true;setBusy(true);const g=generation.current;try{await work(g);}catch(e){if(current(g))setMessage(e instanceof Error?e.message:'Action not confirmed. Keep this review and retry the original request.');}finally{busyRef.current=false;setBusy(false);}}
 async function load(g:number){const rows=await repo.inbox(actor!,organization!);if(current(g))setInbox(rows);}
 useEffect(()=>{setInbox([]);if(actor&&organization&&enabled)void run(load);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor,organization,enabled]);
 function clear(){setSource(null);setPreview(null);setAttempt(null);setIncoming(null);setComplete(false);draft.current=null;}
 async function begin(id:string,copy:boolean,g:number){
  if(source||attempt)throw Error('Close the retained review first.');const captured=getDraft(id),openContext=captureOpen();
  const saved=await lifecycle.read(actor!,organization!,id),p=await library.destinations(actor!,organization!);
  const destinations=copy?p.filter(v=>v.create).map(v=>({id:v.id,name:v.name,direct:true})):await repo.destinations(actor!,id);
  if(!current(g))return;
  if(captured&&captured.record.document_version!==saved.document_version)throw Error('The source has changed on the server. Review or reload it before copying the draft.');
  draft.current=captured;context.current=openContext;setScope(scopeKey);setSource(saved);setMode(copy?'copy':'move');setChoices(destinations);setPlacements(p);setName(saved.display_name+' copy');setSlug(suggestedSlug(saved.display_name+' copy'));
  const dest=destinations.find(v=>v.id===saved.production_id)??destinations[0];setDestination(dest?.id??'');setPhase(saved.phase_id&&p.find(v=>v.id===dest?.id)?.phases.some(f=>f.id===saved.phase_id)?saved.phase_id:'');setDay('');setPreview(null);setAttempt(null);setComplete(false);setMessage('Review the destination. Unassigned does not create a day or change the document date.');
 }
 useEffect(()=>{if(request&&enabled)void run(g=>begin(request.id,request.copy,g));
 // Each caller generates one request; failed starts remain explicit, never auto retried.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[request?.sequence]);
 async function receive(item:TransferRequest,g:number){if(source||attempt)throw Error('Close the retained review first.');const review=await repo.preview(actor!,item.id),p=await library.destinations(actor!,organization!);if(!current(g))return;setScope(scopeKey);setSource(review.schedule);setPreview(review);setIncoming(item);setMode('approve');setDestination(item.destination_id);setPlacements(p);setPhase('');setDay('');setAttempt(null);setComplete(false);setMessage('Review the entire saved schedule before accepting. History becomes available only after the Move.');}
 // Withdraw stale or newly forbidden previews; a fresh explicit review is required.
 useEffect(()=>{if(!incoming||!preview||!enabled||!inScope||complete)return;let cancelled=false;const expected=preview;
  const check=async()=>{try{const next=await repo.preview(actor!,incoming.id);if(!cancelled&&(next.policy!==expected.policy||next.schedule.document_version!==expected.schedule.document_version)){setPreview(null);setAttempt(null);setMessage('Schedule or permissions changed. Review the current schedule again.');}}catch{if(!cancelled){setPreview(null);setAttempt(null);setMessage('Preview access is no longer available.');}}};
  const timer=setInterval(check,15000);window.addEventListener('focus',check);return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',check);};
 },[incoming,preview,enabled,inScope,complete,actor,repo]);
 const previewDocument=mode==='copy'?(attempt?.document??draft.current?.document??preview?.schedule.document):preview?.schedule.document;
 const placement=placements.find(p=>p.id===destination),direct=choices.find(p=>p.id===destination)?.direct===true;
 async function prepare(g:number){if(!source||!destination)return;const review=mode==='approve'?preview:await repo.review(actor!,source.id,destination,mode==='copy');if(!review)throw Error('Review the current schedule again.');if(!current(g))return;
  if(mode==='copy'){validateFileName(name.trim(),slug.trim());if(review.schedule.document_version!==source.document_version)throw Error('Source changed; close this review and capture the draft again.');}
  const document=mode==='copy'?(draft.current?.document??review.schedule.document):review.schedule.document;validateFileDocument(document);
  setPreview(review);setAttempt(captureTransfer({actor:actor!,organization:organization!,kind:mode==='approve'?'approve':mode==='copy'?'copy':direct?'move':'request',id:incoming?.id??crypto.randomUUID(),source:source.id,destination,day:mode==='move'&&!direct?null:day||null,phase:mode==='move'&&!direct?null:phase||null,version:review.schedule.document_version,policy:review.policy,name:name.trim(),slug:slug.trim(),document}));setMessage('Review locked. Confirmation and retries use this exact request.');
 }
 async function confirm(g:number){if(!attempt)return;const result=await repo.send(attempt);if(!current(g))return;setComplete(true);setMessage(result.status==='pending'?'Transfer requested. The source remains unchanged.':'Saved action confirmed.');await load(g);
  if(attempt.kind==='copy'&&current(g)){const opened=await onCopy(attempt.id,context.current);if(current(g)){setMessage(opened?'Copy opened. The source draft is retained on this computer.':'Copy saved. Opening was deferred to preserve your current work. Open it from the library when ready.');if(opened)clear();}}
 }
 return <section className={styles.shell} aria-label="Schedule transfers"><div className={styles.directory}><h2>Move requests</h2><button disabled={!enabled||busy} onClick={()=>void run(load)}>Refresh requests</button></div><p role="status">{message}</p>
 {inbox.map(item=><div key={item.id}><p>{item.source} → {item.destination} · {item.status}</p>{item.reviewable&&<button disabled={busy||!!source||!!attempt} onClick={()=>void run(g=>receive(item,g))}>Review schedule</button>}{item.outgoing&&item.status==='pending'&&<button disabled={busy} onClick={()=>void run(async g=>{await repo.close(actor!,item.id,'cancelled');if(current(g))await load(g);})}>Cancel request</button>}</div>)}
 {source&&!inScope&&<p>A transfer review is retained in another account or organization.</p>}
 <dialog ref={dialog} className={transferStyles.dialog} aria-label="Move or Duplicate schedule" onCancel={e=>{if(busy||attempt){e.preventDefault();return;}clear();}}><h2>{mode==='approve'?'Review incoming schedule':mode==='copy'?'Duplicate schedule':'Move schedule'}</h2><p>{source?.display_name}</p><p role="status">{message}</p>
 {!attempt&&<><div className={styles.login}>{mode!=='approve'&&<label>Destination production<select value={destination} disabled={busy} onChange={e=>{const p=placements.find(v=>v.id===e.target.value);setDestination(e.target.value);setPhase(previous=>p?.phases.some(f=>f.id===previous)?previous:'');setDay('');setPreview(null);}}><option value="">Choose destination</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{!p.direct?' · Request approval':''}</option>)}</select></label>}
 {(mode!=='move'||direct)&&<><label>Destination phase<select disabled={busy||!!day} value={phase} onChange={e=>setPhase(e.target.value)}><option value="">No phase</option>{placement?.phases.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Destination day<select disabled={busy} value={day} onChange={e=>{setDay(e.target.value);if(e.target.value)setPhase(placement?.days.find(d=>d.id===e.target.value)?.phase??'');}}><option value="">Unassigned</option>{placement?.days.map(d=><option key={d.id} value={d.id}>Day {d.number??d.position+1}{d.date?' · '+d.date:''}</option>)}</select></label></>}
 {mode==='copy'&&<><label>Copy name<input value={name} onChange={e=>{setName(e.target.value);setSlug(suggestedSlug(e.target.value));}}/></label><label>Copy address<input value={slug} onChange={e=>setSlug(e.target.value)}/></label></>}
 </div>{mode==='approve'&&!preview&&<button disabled={busy} onClick={()=>void run(async g=>{const next=await repo.preview(actor!,incoming!.id);if(current(g)){setPreview(next);setSource(next.schedule);setMessage('Current saved schedule loaded for review.');}})}>Review current schedule again</button>}
 <button disabled={busy||!destination||(mode==='approve'&&!preview)} onClick={()=>void run(prepare)}>Prepare {mode==='copy'?'Duplicate':mode==='approve'?'approval':direct?'Move':'request'}</button></>}
 {preview&&<details open><summary>{mode==='copy'?'Captured source draft':'Whole saved schedule'} · version {preview.schedule.document_version}</summary><div className={transferStyles.preview}><ScheduleReadView data={{...previewDocument,meta:makeMeta(previewDocument?.meta),rows:previewDocument?.rows??[]} as ScheduleData} name={preview.schedule.display_name}/></div><details><summary>All document fields</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(previewDocument,null,2)}</pre></details></details>}
 {attempt&&<><p>{attempt.kind} · saved version {attempt.version} · {placement?.name??choices.find(p=>p.id===destination)?.name??incoming?.destination} · {attempt.day?'Selected day':'Unassigned'}. Date, location and rows are retained; Move and Duplicate use destination production/phase labels.</p>{!complete&&<button disabled={busy} onClick={()=>void run(confirm)}>Confirm or check original {attempt.kind}</button>}{complete&&<p>Confirmed identity: {attempt.kind==='copy'?attempt.id:attempt.source}</p>}</>}
 {incoming&&!complete&&<button disabled={busy} onClick={()=>void run(async g=>{await repo.close(actor!,incoming.id,'declined');if(current(g)){clear();await load(g);}})}>Decline request</button>}
 <button disabled={busy} onClick={clear}>{complete?'Close confirmed result':attempt?'Discard local review':'Cancel'}</button></dialog></section>;
}
