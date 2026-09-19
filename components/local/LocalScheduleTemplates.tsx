'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import LocalBrowserTemplates from './LocalBrowserTemplates';
import Modal,{ModalVisibilityContext} from '@/components/modals/Modal';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {ScheduleRepositoryError,type StoredSchedule} from '@/lib/platform/schedule-repository';
import {templateDraftRows,captureTemplateAttempt,clearTemplateRequest,createTemplateRepository,readTemplateRequest,retainTemplateRequest,type RetainedTemplateRequest,type TemplateApplyReview,type TemplateOperation,type TemplateProduction,type TemplateRecord} from '@/lib/platform/schedule-templates';
export interface TemplateDraftContext {id:string;version:number;documentSession:number;editRevision:number}
const operationLabel:Record<TemplateOperation,string>={create:'Save template',replace:'Replace template',rename:'Rename template',trash:'Move to Trash',restore:'Restore template',publish:'Publish template',unpublish:'Withdraw publication',import:'Import browser template'};
interface Props {onClose?:()=>void;openRequest?:number;client:SupabaseClient;actor:string|null;organization:string|null;enabled:boolean;canWriteCurrent:boolean;getSource:()=>StoredSchedule|null;canApply:()=>boolean;onApply:(review:TemplateApplyReview,context:TemplateDraftContext)=>boolean;onState:(dirty:boolean,busy:boolean)=>void;requireAuth:()=>void}
export default function LocalScheduleTemplates({onClose,openRequest,client,actor,organization,enabled,canWriteCurrent,getSource,canApply,onApply,onState,requireAuth}:Props){
 const [repo]=useState(()=>createTemplateRepository(client));
 const [open,setOpen]=useState(false),[productions,setProductions]=useState<TemplateProduction[]>([]),[production,setProduction]=useState('');
 const [mode,setMode]=useState<'production'|'organization'|'trash'>('production'),[items,setItems]=useState<TemplateRecord[]>([]),[name,setName]=useState(''),[newName,setNewName]=useState('');
 const [selected,setSelected]=useState<TemplateRecord|null>(null),[pending,setPending]=useState<RetainedTemplateRequest|null>(null);
 const [apply,setApply]=useState<{review:TemplateApplyReview;context:TemplateDraftContext}|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[scope,setScope]=useState('');
 const pendingUses=useScheduleStore(s=>s.templateUses.length);
 const visibility=useRef(0);
 const ticket=useRef(0),busyRef=useRef(false),latest=useRef({actor,organization,enabled});latest.current={actor,organization,enabled};
 const key=`${actor}:${organization}`,inScope=scope===key;
 useEffect(()=>{ticket.current++;busyRef.current=false;setBusy(false);setScope(key);setOpen(false);setItems([]);setSelected(null);setApply(null);setName('');setNewName('');setProduction('');setProductions([]);setPending(null);setMessage('');
  if(actor&&organization){try{const retained=readTemplateRequest(localStorage,actor,organization);if(retained){setPending(retained);setProduction(retained.attempt.production);setMessage('A template request is retained. Open Templates to review or check its result.');}}catch(e){setMessage(e instanceof Error?e.message:'Recovery is unavailable.');}}
 },[actor,organization,key]);
 useEffect(()=>{onState(open||!!pending,busy);},[open,pending,busy,onState]);
 useEffect(()=>()=>{ticket.current++;},[]);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(busyRef.current||!enabled||!actor||!organization||!inScope)return;
  busyRef.current=true;setBusy(true);const seq=++ticket.current,a=actor,o=organization,view=visibility.current;
  const current=()=>view===visibility.current&&seq===ticket.current&&latest.current.actor===a&&latest.current.organization===o&&latest.current.enabled;
  try{await work(current);}catch(e){if(current()){setMessage(e instanceof ScheduleRepositoryError?e.kind==='conflict'?'The name may already exist, or the template, schedule or permissions changed. Your draft is retained. Choose a unique name or refresh and review again.':e.kind==='unavailable'?'This template operation is unavailable under current permissions. Your draft and any pending request are retained.':e.message:e instanceof Error?e.message:'Template operation failed.');if(e instanceof ScheduleRepositoryError&&e.kind==='unauthenticated')requireAuth();}}
  finally{if(seq===ticket.current){busyRef.current=false;setBusy(false);}}
 }
 const lastOpenRequest=useRef(0);
 useEffect(()=>{if(!openRequest||openRequest===lastOpenRequest.current||!enabled||!actor||!organization)return;lastOpenRequest.current=openRequest;visibility.current++;setOpen(true);void run(current=>refresh(current));
 // Keep the existing authorization and retained-request machinery.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[openRequest,enabled,actor,organization]);
 async function refresh(current:()=>boolean,p=production,m=mode){const ps=await repo.productions(actor!,organization!);const chosen=p||getSource()?.production_id||ps[0]?.id||'';const next=m==='organization'||chosen?await repo.inventory(actor!,organization!,chosen,m==='trash',m==='organization'):[];if(current()){setProductions(ps);setProduction(chosen);setItems(next);}}
 function begin(a:ReturnType<typeof captureTemplateAttempt>){const value={attempt:a,started:false};retainTemplateRequest(localStorage,value);setPending(value);setApply(null);setMessage('Review the exact change below before confirming.');}
 async function prepare(row:TemplateRecord,operation:TemplateOperation,current:()=>boolean){
  const fresh=await repo.read(actor!,row.id,organization!);if(!current())return;
  setSelected(fresh);setName(fresh.name);
  if(operation==='replace'&&(!canWriteCurrent||pendingUses||getSource()?.production_id!==fresh.production_id))throw Error('Save any applied template first, and open an editable schedule in this production.');
  const source=getSource();begin(captureTemplateAttempt({actor:actor!,organization:organization!,production:fresh.production_id,id:fresh.id,request:crypto.randomUUID(),version:fresh.version,operation,name:['replace','restore'].includes(operation)?fresh.name:null,rows:operation==='replace'?templateDraftRows(useScheduleStore.getState().rows):null,source:operation==='replace'?source!.id:null,sourceVersion:operation==='replace'?source!.document_version:null,previewName:fresh.name,previewRows:operation==='replace'?templateDraftRows(useScheduleStore.getState().rows):fresh.rows}));
 }
 async function send(current:()=>boolean,checkOnly=false){
  if(!pending)return;const a=pending.attempt;
  if(pending.started){const receipt=await repo.probe(a);if(!current())return;if(receipt){clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));setSelected(null);setMessage('Template change confirmed. Your schedule draft is unchanged.');await refresh(current);return;}if(checkOnly){setMessage('No matching result is confirmed yet. Retry uses the same exact request; your draft is retained.');return;}}
  const sent={attempt:a,started:true};retainTemplateRequest(localStorage,sent);setPending(sent);
  try{await repo.send(a);}catch(e){if(current()&&e instanceof ScheduleRepositoryError&&['invalid','conflict'].includes(e.kind)){clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));}throw e;}
  if(!current())return;clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));setSelected(null);setName('');setNewName('');setMessage('Template change confirmed. Your schedule draft is unchanged.');await refresh(current);
 }
 const writeProduction=productions.find(p=>p.id===production)?.can_manage===true;
 const canCapture=canWriteCurrent&&!pendingUses&&getSource()?.production_id===production;
 return <section aria-label="Templates">
  <button className="btn btn-light" disabled={!enabled||busy||!actor||!organization} onClick={()=>{visibility.current++;setOpen(true);void run(current=>refresh(current));}}>Templates{inScope&&pending?' · request retained':''}</button>
  {!open&&inScope&&message&&<p role="status">{message}</p>}
  <ModalVisibilityContext.Provider value={enabled&&inScope}><Modal open={open} onClose={()=>{visibility.current++;setOpen(false);onClose?.();}} title="Templates" className="template-modal" retainWhenHidden>
   <p>Templates start in their production. Organization publication is deliberate and keeps source restrictions.</p>
   <p role="status" aria-live="polite">{message}</p>
   {pendingUses>0&&<p>Save the applied template in your schedule before saving that draft as another template or making a copy.</p>}
   <fieldset disabled={busy||!!pending||!!apply} style={{border:0,padding:0}}>
    <label>Template library<select value={mode} onChange={e=>{const m=e.target.value as typeof mode;setMode(m);setSelected(null);void run(current=>refresh(current,production,m));}}><option value="production">Production templates</option><option value="organization">Published to organization</option><option value="trash">Production Trash</option></select></label>
    {mode!=='organization'&&<label>Template production<select value={production} onChange={e=>{const p=e.target.value;setProduction(p);setSelected(null);void run(current=>refresh(current,p));}}><option value="">Choose production</option>{productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <button className="btn btn-light" onClick={()=>void run(current=>refresh(current))}>Refresh templates</button>
    {mode==='production'&&writeProduction&&<div><label>New template name<input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={150}/></label><button className="btn btn-primary" disabled={!newName.trim()||!canCapture} onClick={()=>void run(async()=>{const s=getSource();if(!s||!canCapture)return;begin(captureTemplateAttempt({actor:actor!,organization:organization!,production,id:crypto.randomUUID(),request:crypto.randomUUID(),version:0,operation:'create',name:newName.trim(),rows:templateDraftRows(useScheduleStore.getState().rows),source:s.id,sourceVersion:s.document_version,previewName:newName.trim(),previewRows:templateDraftRows(useScheduleStore.getState().rows)}));})}>Save draft as template</button>{!canCapture&&<p>Open an editable schedule in this production to save its rows as a template.</p>}</div>}
    {!items.length&&<p>No available templates in this library.</p>}
    <ul className="template-list">{items.map(t=><li key={t.id}><button className="btn btn-light" onClick={()=>void run(async current=>{const v=await repo.read(actor!,t.id,organization!);if(current()){setSelected(v);setName(v.name);}})}>{t.name}</button><span> · {t.row_count} rows · {t.published_at?'Published to organization':'Production only'}{t.production_name?` · ${t.production_name}`:''}</span></li>)}</ul>
   </fieldset>
   {actor&&organization&&<div style={{display:pending||apply?'none':undefined}}><LocalBrowserTemplates key={`${actor}:${organization}`} actor={actor} organization={organization} productions={productions} disabled={busy||!!pending||!!apply} onPrepare={begin}/></div>}
   {!pending&&!apply&&selected&&<fieldset disabled={busy} style={{border:0,padding:0}}><legend>{selected.name}</legend>
    <details><summary>Review all template rows, including notes and contacts</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'40vh',overflow:'auto'}}>{JSON.stringify(selected.rows,null,2)}</pre></details>
    {!selected.deleted_at&&<button className="btn btn-primary" disabled={!canApply()} onClick={()=>void run(async current=>{const s=getSource(),st=useScheduleStore.getState();if(!s||!canApply())return;const context={id:s.id,version:s.document_version,documentSession:st.documentSession,editRevision:st.editRevision};const review=await repo.reviewApply(actor!,selected.id,s.id,organization!);if(current()){setApply({review,context});setMessage('Review application to the currently open schedule. Nothing has been saved.');}})}>Review Apply to current schedule</button>}
    {selected.can_manage&&<><label>Template name<input value={name} maxLength={150} onChange={e=>setName(e.target.value)}/></label><button className="btn btn-light" disabled={!name.trim()||name.trim()===selected.name} onClick={()=>void run(async current=>{const fresh=await repo.read(actor!,selected.id,organization!);if(!current())return;begin(captureTemplateAttempt({actor:actor!,organization:organization!,production:fresh.production_id,id:fresh.id,request:crypto.randomUUID(),version:fresh.version,operation:'rename',name:name.trim(),rows:null,source:null,sourceVersion:null,previewName:fresh.name,previewRows:fresh.rows}));})}>Review rename</button>{!selected.deleted_at&&<button className="btn btn-light" disabled={!canWriteCurrent||!!pendingUses||getSource()?.production_id!==selected.production_id} onClick={()=>void run(current=>prepare(selected,'replace',current))}>Replace with current draft rows</button>}</>}
    {selected.can_trash&&<button className="btn btn-light" onClick={()=>void run(current=>prepare(selected,selected.deleted_at?'restore':'trash',current))}>{selected.deleted_at?'Review restore':'Review move to Trash'}</button>}
    {selected.can_publish&&!selected.deleted_at&&<button className="btn btn-light" onClick={()=>void run(current=>prepare(selected,selected.published_at?'unpublish':'publish',current))}>{selected.published_at?'Review withdraw publication':'Review organization publication'}</button>}
   </fieldset>}
   {pending&&<section aria-label="Template change review"><h3>{operationLabel[pending.attempt.operation]}: {pending.attempt.previewName}</h3><p>Destination production: {productions.find(p=>p.id===pending.attempt.production)?.name??'Original reviewed production'}</p>
    <p>{pending.attempt.operation==='import'?'Import the reviewed browser content into the selected production only. Original browser data and files stay untouched.':pending.attempt.operation==='publish'?'This publishes the reviewed rows, including notes and contact details, to authorized members across this organization. Source restrictions still apply. Later content changes require publication again.':pending.attempt.operation==='unpublish'?'This stops new organization-wide delivery. It does not recall copies already received.':pending.attempt.operation==='trash'?'This moves the template into recoverable Trash and withdraws publication.':pending.attempt.operation==='restore'?'This restores the template to its production only.':'This changes the template only. Published content returns to production scope when changed.'}</p>
    {pending.attempt.name&&<p>Name: {pending.attempt.name}</p>}
    <details open={pending.attempt.operation==='publish'}><summary>Review exact rows ({pending.attempt.previewRows?.length??0})</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'35vh',overflow:'auto'}}>{JSON.stringify(pending.attempt.previewRows,null,2)}</pre></details>
    <button className="btn btn-primary" disabled={busy} onClick={()=>void run(current=>send(current))}>{pending.started?'Retry exact template request':pending.attempt.operation==='publish'?'Confirm publish to organization':'Confirm template change'}</button>
    {pending.started?<><button className="btn btn-light" disabled={busy} onClick={()=>void run(current=>send(current,true))}>Check template result</button><p>The exact request is retained for this account and organization, including after reload. An unconfirmed result does not mean it failed.</p></>:<button className="btn btn-light" disabled={busy} onClick={()=>{clearTemplateRequest(localStorage,pending.attempt);setPending(null);setMessage('Review cancelled. Nothing was sent.');}}>Cancel template change</button>}
   </section>}
   {apply&&<section aria-label="Apply template review"><h3>Apply {apply.review.template.name}</h3><p>Replace the current rows, including any unsaved row edits. Keep this schedule’s metadata, name and placement. You can Undo the application. Save schedule commits the rows and their source restrictions together.</p>
    <details><summary>Review rows to apply ({apply.review.template.rows.length})</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:'35vh',overflow:'auto'}}>{JSON.stringify(apply.review.template.rows,null,2)}</pre></details>
    <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async current=>{const fresh=await repo.reviewApply(actor!,apply.review.template.id,apply.context.id,organization!);if(!current())return;if(fresh.template.version!==apply.review.template.version||fresh.policy!==apply.review.policy||fresh.target_version!==apply.context.version)throw Error('The template, source permissions or receiving schedule changed. Cancel and review again; your draft is retained.');if(!onApply(fresh,apply.context))throw Error('The current document changed during review. Cancel and review again; your newer edits are retained.');setApply(null);setOpen(false);onClose?.();setMessage('Template applied to the draft. Metadata is retained. Undo is available; Save schedule commits it.');})}>Apply rows to draft</button><button className="btn btn-light" disabled={busy} onClick={()=>{setApply(null);setMessage('Apply cancelled. Your draft is unchanged.');}}>Keep current rows</button>
   </section>}
  </Modal></ModalVisibilityContext.Provider>
 </section>;
}
