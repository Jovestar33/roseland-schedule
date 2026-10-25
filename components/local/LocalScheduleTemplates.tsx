'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createScheduleLibraryRepository,type LibraryRecord} from '@/lib/platform/schedule-library';
import {createLifecycleRepository} from '@/lib/platform/schedule-lifecycle-repository';
import TemplateRowsPreview from './TemplateRowsPreview';
import styles from './template-library.module.css';
import ScheduleToolsTabs from './ScheduleToolsTabs';
import toolStyles from './schedule-tools.module.css';
import Modal,{ModalVisibilityContext} from '@/components/modals/Modal';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {ScheduleRepositoryError,type StoredSchedule} from '@/lib/platform/schedule-repository';
import {templateDraftRows,captureTemplateAttempt,clearTemplateRequest,createTemplateRepository,readTemplateRequest,retainTemplateRequest,type RetainedTemplateRequest,type TemplateApplyReview,type TemplateOperation,type TemplateProduction,type TemplateRecord} from '@/lib/platform/schedule-templates';
export interface TemplateDraftContext {id:string;version:number;documentSession:number;editRevision:number}
const templateSuccess:Record<TemplateOperation,string>={create:'Template saved.',replace:'Template updated.',rename:'Template renamed.',trash:'Template moved to Trash.',restore:'Template restored.',publish:'Template shared with your organization.',unpublish:'Template sharing stopped.',import:'Template imported.'};
const operationLabel:Record<TemplateOperation,string>={create:'Save template',replace:'Update template',rename:'Rename template',trash:'Move to trash',restore:'Restore template',publish:'Share template',unpublish:'Stop sharing',import:'Import browser template'};
interface Props {animateEntry?:boolean;onRecovery?:()=>void;embedded?:boolean;onClose?:()=>void;openRequest?:number;client:SupabaseClient;actor:string|null;organization:string|null;enabled:boolean;canWriteCurrent:boolean;getSource:()=>StoredSchedule|null;canApply:()=>boolean;onApply:(review:TemplateApplyReview,context:TemplateDraftContext)=>boolean;onState:(dirty:boolean,busy:boolean)=>void;requireAuth:()=>void}
export default function LocalScheduleTemplates({animateEntry=true,embedded=false,onRecovery,onClose,openRequest,client,actor,organization,enabled,canWriteCurrent,getSource,canApply,onApply,onState,requireAuth}:Props){
 const [repo]=useState(()=>createTemplateRepository(client));
 const [library]=useState(()=>createScheduleLibraryRepository(client)),[lifecycle]=useState(()=>createLifecycleRepository(client));
 const [view,setView]=useState<'browse'|'create'>('browse'),[sources,setSources]=useState<LibraryRecord[]>([]),[createProduction,setCreateProduction]=useState(''),[sourceId,setSourceId]=useState(''),[useDraft,setUseDraft]=useState(false);
 const [open,setOpen]=useState(false),[productions,setProductions]=useState<TemplateProduction[]>([]),[production,setProduction]=useState('');
 const [mode,setMode]=useState<'production'|'organization'|'trash'>('production'),[items,setItems]=useState<TemplateRecord[]>([]),[name,setName]=useState(''),[newName,setNewName]=useState('');
 const [selected,setSelected]=useState<TemplateRecord|null>(null),[pending,setPending]=useState<RetainedTemplateRequest|null>(null);
 const [apply,setApply]=useState<{review:TemplateApplyReview;context:TemplateDraftContext}|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[scope,setScope]=useState('');
 const pendingUses=useScheduleStore(s=>s.templateUses.length);
 // Switching tabs replaces this surface immediately; normal closes still animate.
 const visibility=useRef(0),switchingTab=useRef(false);
 const ticket=useRef(0),busyRef=useRef(false),latest=useRef({actor,organization,enabled});latest.current={actor,organization,enabled};
 const key=`${actor}:${organization}`,inScope=scope===key;
 useEffect(()=>{switchingTab.current=false;ticket.current++;busyRef.current=false;setBusy(false);setScope(key);setOpen(false);setItems([]);setSelected(null);setApply(null);setName('');setNewName('');setProduction('');setProductions([]);setPending(null);setMessage('');setView('browse');setSources([]);setCreateProduction('');setSourceId('');setUseDraft(false);
  if(actor&&organization){try{const retained=readTemplateRequest(localStorage,actor,organization);if(retained){setPending(retained);setProduction(retained.attempt.production);setMessage('A template change needs checking. Open Templates to see its progress.');}}catch(e){setMessage(e instanceof Error?e.message:'Recovery is unavailable.');}}
 },[actor,organization,key]);
 useEffect(()=>{onState(open||!!pending,busy);},[open,pending,busy,onState]);
 useEffect(()=>()=>{ticket.current++;},[]);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(busyRef.current||!enabled||!actor||!organization||!inScope)return;
  busyRef.current=true;setBusy(true);const seq=++ticket.current,a=actor,o=organization,view=visibility.current;
  const current=()=>view===visibility.current&&seq===ticket.current&&latest.current.actor===a&&latest.current.organization===o&&latest.current.enabled;
  try{await work(current);}catch(e){if(current()){setMessage(e instanceof ScheduleRepositoryError?e.kind==='conflict'?'The name may already exist, or the template, schedule or permissions changed. Your draft is retained. Choose a unique name or refresh and review again.':e.kind==='unavailable'?'This template isn’t available to your account. Your draft is unchanged.':e.message:e instanceof Error?e.message:'Template operation failed.');if(e instanceof ScheduleRepositoryError&&e.kind==='unauthenticated')requireAuth();}}
  finally{if(seq===ticket.current){busyRef.current=false;setBusy(false);}}
 }
 const lastOpenRequest=useRef(0);
 useEffect(()=>{if(!openRequest||openRequest===lastOpenRequest.current||!enabled||!actor||!organization)return;lastOpenRequest.current=openRequest;switchingTab.current=false;visibility.current++;setOpen(true);void run(current=>refresh(current));
 // Keep the existing authorization and retained-request machinery.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[openRequest,enabled,actor,organization]);
 async function refresh(current:()=>boolean,p=production,m=mode){const ps=await repo.productions(actor!,organization!);const chosen=p||getSource()?.production_id||ps[0]?.id||'';const next=m==='organization'||chosen?await repo.inventory(actor!,organization!,chosen,m==='trash',m==='organization'):[];if(current()){setProductions(ps);setProduction(chosen);setItems(next);}}
 async function openCreate(current:()=>boolean){
  const ps=await repo.productions(actor!,organization!),rows=await library.inventory(actor!,organization!);if(!current())return;
  const editable=rows.filter(r=>r.can_edit&&!r.deleted_at&&r.status!=='archived'&&ps.some(p=>p.id===r.production_id&&p.can_manage));
  const p=ps.find(p=>p.can_manage&&p.id===(getSource()?.production_id||production))?.id||ps.find(p=>p.can_manage)?.id||'';
  setProductions(ps);setSources(editable);setCreateProduction(p);setSourceId('');setUseDraft(false);setSelected(null);setMessage('');setView('create');
 }
 async function reviewCreate(current:()=>boolean){
  const choice=sources.find(s=>s.id===sourceId&&s.production_id===createProduction&&s.can_edit&&!s.deleted_at&&s.status!=='archived');
  if(!choice||!newName.trim()||!productions.some(p=>p.id===createProduction&&p.can_manage))throw Error('Choose a production and an editable source schedule.');
  const draft=useScheduleStore.getState(),opened=getSource(),draftSession=draft.documentSession,draftRevision=draft.editRevision;
  if(useDraft&&(!canWriteCurrent||pendingUses||opened?.id!==choice.id||opened.production_id!==createProduction))throw Error('Save your applied template changes, or use the saved schedule.');
  const source=await lifecycle.read(actor!,organization!,choice.id);if(!current())return;
  if(source.production_id!==createProduction||source.deleted_at||source.status==='archived')throw Error('The source schedule moved or is no longer available. Choose it again.');
  if(useDraft&&(opened!.document_version!==source.document_version||getSource()?.id!==source.id||useScheduleStore.getState().documentSession!==draftSession||useScheduleStore.getState().editRevision!==draftRevision))throw Error('The schedule changed. Review the latest version before continuing.');
  const rows=templateDraftRows(useDraft?draft.rows:source.document.rows??[]);
  begin(captureTemplateAttempt({actor:actor!,organization:organization!,production:createProduction,id:crypto.randomUUID(),request:crypto.randomUUID(),version:0,operation:'create',name:newName.trim(),rows,source:source.id,sourceVersion:source.document_version,previewName:newName.trim(),previewRows:rows}));
 }
 function begin(a:ReturnType<typeof captureTemplateAttempt>){const value={attempt:a,started:false};retainTemplateRequest(localStorage,value);setPending(value);setApply(null);setMessage('');}
 async function prepare(row:TemplateRecord,operation:TemplateOperation,current:()=>boolean){
  const fresh=await repo.read(actor!,row.id,organization!);if(!current())return;
  setSelected(fresh);setName(fresh.name);
  if(operation==='replace'&&(!canWriteCurrent||pendingUses||getSource()?.production_id!==fresh.production_id))throw Error('Save any applied template first, and open an editable schedule in this production.');
  const source=getSource();begin(captureTemplateAttempt({actor:actor!,organization:organization!,production:fresh.production_id,id:fresh.id,request:crypto.randomUUID(),version:fresh.version,operation,name:['replace','restore'].includes(operation)?fresh.name:null,rows:operation==='replace'?templateDraftRows(useScheduleStore.getState().rows):null,source:operation==='replace'?source!.id:null,sourceVersion:operation==='replace'?source!.document_version:null,previewName:fresh.name,previewRows:operation==='replace'?templateDraftRows(useScheduleStore.getState().rows):fresh.rows}));
 }
 async function send(current:()=>boolean,checkOnly=false){
  if(!pending)return;const a=pending.attempt;
  if(pending.started){const receipt=await repo.probe(a);if(!current())return;if(receipt){clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));setSelected(null);setMessage(templateSuccess[a.operation]);await refresh(current);return;}if(checkOnly){setMessage('This change hasn’t been confirmed yet. You can check again or retry safely.');return;}}
  const sent={attempt:a,started:true};retainTemplateRequest(localStorage,sent);setPending(sent);
  try{await repo.send(a);}catch(e){if(current()&&e instanceof ScheduleRepositoryError&&['invalid','conflict'].includes(e.kind)){clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));}throw e;}
  if(!current())return;clearTemplateRequest(localStorage,a);setPending(readTemplateRequest(localStorage,a.actor,a.organization));setSelected(null);setName('');setNewName('');setView('browse');setProduction(a.production);setMode('production');setMessage(templateSuccess[a.operation]);await refresh(current,a.production,'production');
 }
 const writeProduction=productions.find(p=>p.id===production)?.can_manage===true;
 const canUseDraft=canWriteCurrent&&!pendingUses&&getSource()?.id===sourceId&&getSource()?.production_id===createProduction;
 const reviewFooter=apply?<><button className="btn btn-pink" disabled={busy} onClick={()=>void run(async current=>{const fresh=await repo.reviewApply(actor!,apply.review.template.id,apply.context.id,organization!);if(!current())return;if(fresh.template.version!==apply.review.template.version||fresh.policy!==apply.review.policy||fresh.target_version!==apply.context.version)throw Error('The template, source permissions or receiving schedule changed. Cancel and review again; your draft is retained.');if(!onApply(fresh,apply.context))throw Error('The current document changed during review. Cancel and review again; your newer edits are retained.');setApply(null);setOpen(false);onClose?.();setMessage('Template applied. Use Undo to reverse it, or Save to keep the changes.');})}>Apply template</button><button className="btn btn-light" disabled={busy} onClick={()=>{setApply(null);setMessage('Apply cancelled. Your draft is unchanged.');}}>Cancel</button></>:pending?<div className={styles.reviewActions}><button className="btn btn-pink" disabled={busy} onClick={()=>void run(current=>send(current))}>{pending.started?'Retry change':pending.attempt.operation==='create'?'Save template':pending.attempt.operation==='publish'?'Share with organization':'Confirm change'}</button>
    {pending.started?<><button className="btn btn-light" disabled={busy} onClick={()=>void run(current=>send(current,true))}>Check result</button><p>This change is saved for recovery. Check its result before making another change.</p></>:<button className="btn btn-light" disabled={busy} onClick={()=>{clearTemplateRequest(localStorage,pending.attempt);setPending(null);setMessage('Change cancelled.');}}>Cancel</button>}</div>:undefined;
 return <section aria-label="Templates">
  {!embedded&&<button className="btn btn-light" disabled={!enabled||busy||!actor||!organization} onClick={()=>{switchingTab.current=false;visibility.current++;setOpen(true);void run(current=>refresh(current));}}>Templates{inScope&&pending?' · needs checking':''}</button>}
  {!embedded&&!open&&inScope&&message&&<p role="status">{message}</p>}
  <ModalVisibilityContext.Provider value={enabled&&inScope&&!switchingTab.current}><Modal exitDuration={onRecovery?200:0} open={open} onClose={()=>{visibility.current++;setOpen(false);onClose?.();}} title={onRecovery?"Tools":"Templates"} className={`template-modal ${onRecovery?toolStyles.drawer:''} ${onRecovery&&!animateEntry?toolStyles.stationary:''}`} footer={reviewFooter??<button data-modal-close className="btn btn-light" onClick={()=>{visibility.current++;setOpen(false);onClose?.();}}>Close</button>} retainWhenHidden>
   {onRecovery&&<ScheduleToolsTabs active="templates" onTemplates={()=>{}} onRecovery={()=>{switchingTab.current=true;visibility.current++;setOpen(false);onRecovery();}}/>}
   {!pending&&!apply&&<p className={styles.intro}>Reuse a complete schedule layout, or save one as a template.</p>}
   <p hidden={!message} role="status" aria-live="polite" className={styles.feedback}>{message}</p>
   {pendingUses>0&&<p>Save the applied template in your schedule before saving that draft as another template or making a copy.</p>}
   {!pending&&!apply&&<div className={styles.viewTabs} role="group" aria-label="Template options"><button className="btn btn-light" aria-pressed={view==='browse'} disabled={busy} onClick={()=>{setView('browse');setMessage('');}}>Saved templates</button><button className="btn btn-light" aria-pressed={view==='create'} disabled={busy||!productions.some(p=>p.can_manage)} onClick={()=>void run(openCreate)}>Create a template</button></div>}
   <fieldset hidden={view!=='browse'||!!pending||!!apply} disabled={busy||!!pending||!!apply} style={{border:0,padding:0}}>
    <div className={styles.filters}><label hidden={mode==='trash'}>Show saved templates<select value={mode} onChange={e=>{const m=e.target.value as typeof mode;setMode(m);setSelected(null);void run(current=>refresh(current,production,m));}}><option value="production">Production templates</option><option value="organization">Shared with organization</option></select></label>
    {mode!=='organization'&&<label>Filter by production<select value={production} onChange={e=>{const p=e.target.value;setProduction(p);setSelected(null);void run(current=>refresh(current,p));}}><option value="">Choose production</option>{productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <button className="btn btn-light" onClick={()=>void run(current=>refresh(current))}>Refresh templates</button></div>

    {mode==='trash'&&<div className={styles.deletedNotice}><strong>Deleted templates</strong><button className="btn btn-light btn-sm" onClick={()=>{setMode('production');setSelected(null);void run(current=>refresh(current,production,'production'));}}>← Back</button></div>}
    {!items.length&&<div className={styles.empty}><strong>{mode==='trash'?'No deleted templates.':'No templates yet.'}</strong><p>{mode==='trash'?'Templates moved to trash can be restored here.':'Save a schedule layout to reuse it later.'}</p></div>}
    <ul className={styles.list} aria-label="Available templates">{items.map(t=><li key={t.id}><button className={styles.item} aria-label={t.name} aria-pressed={selected?.id===t.id} onClick={()=>void run(async current=>{const v=await repo.read(actor!,t.id,organization!);if(current()){setSelected(v);setName(v.name);}})}><span><strong>{t.name}</strong><small>{t.published_at?'Shared with organization':'Production only'}{t.production_name?` · ${t.production_name}`:''}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>
   </fieldset>

   {view==='browse'&&!pending&&!apply&&selected&&<fieldset disabled={busy} className={styles.selected}><legend>{selected.name}</legend>
    <details className={styles.preview}><summary>Preview template</summary><TemplateRowsPreview rows={selected.rows??[]}/></details>
    {!selected.deleted_at&&<button className="btn btn-pink" disabled={!canApply()} onClick={()=>void run(async current=>{const s=getSource(),st=useScheduleStore.getState();if(!s||!canApply())return;const context={id:s.id,version:s.document_version,documentSession:st.documentSession,editRevision:st.editRevision};const review=await repo.reviewApply(actor!,selected.id,s.id,organization!);if(current()){setApply({review,context});setMessage('Review this template before applying it to your schedule.');}})}>Apply to current schedule</button>}
    {(selected.can_manage||selected.can_trash||selected.can_publish)&&<details className={styles.manage}><summary>Manage template</summary>
    {selected.can_manage&&<><label>Template name<input value={name} maxLength={150} onChange={e=>setName(e.target.value)}/></label><button className="btn btn-light" disabled={!name.trim()||name.trim()===selected.name} onClick={()=>void run(async current=>{const fresh=await repo.read(actor!,selected.id,organization!);if(!current())return;begin(captureTemplateAttempt({actor:actor!,organization:organization!,production:fresh.production_id,id:fresh.id,request:crypto.randomUUID(),version:fresh.version,operation:'rename',name:name.trim(),rows:null,source:null,sourceVersion:null,previewName:fresh.name,previewRows:fresh.rows}));})}>Review rename</button>{!selected.deleted_at&&<button className="btn btn-light" disabled={!canWriteCurrent||!!pendingUses||getSource()?.production_id!==selected.production_id} onClick={()=>void run(current=>prepare(selected,'replace',current))}>Update from current schedule</button>}</>}
    {selected.can_trash&&<button className="btn btn-light" onClick={()=>void run(current=>prepare(selected,selected.deleted_at?'restore':'trash',current))}>{selected.deleted_at?'Review restore':'Move to trash'}</button>}
    {selected.can_publish&&!selected.deleted_at&&<button className="btn btn-light" onClick={()=>void run(current=>prepare(selected,selected.published_at?'unpublish':'publish',current))}>{selected.published_at?'Stop sharing with organization':'Share with organization'}</button>}
    </details>}
   </fieldset>}
   {view==='create'&&!pending&&!apply&&<fieldset disabled={busy} className={styles.createForm}><legend>Create a template</legend><p>Choose the schedule you want to reuse, then give the template a name.</p>
    <label>Production<select value={createProduction} onChange={e=>{setCreateProduction(e.target.value);setSourceId('');setUseDraft(false);setMessage('');}}><option value="">Choose a production</option>{productions.filter(p=>p.can_manage).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Source schedule<select value={sourceId} disabled={!createProduction} onChange={e=>{setSourceId(e.target.value);setUseDraft(false);setMessage('');}}><option value="">Choose a schedule</option>{sources.filter(s=>s.production_id===createProduction).map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
    {createProduction&&!sources.some(s=>s.production_id===createProduction)&&<p role="status">No editable schedules in this production. Create a schedule first, or choose another production.</p>}
    <label>Template name<input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={150} placeholder="For example, Downtown interviews"/></label>
    {canUseDraft&&<label className={styles.draftChoice}><input type="checkbox" checked={useDraft} onChange={e=>setUseDraft(e.target.checked)}/>Include unsaved changes from the open schedule</label>}
    <p className={styles.hint}>{useDraft&&canUseDraft?'Includes the open schedule’s unsaved changes.':'Uses the complete saved action list, including notes and contacts.'} Dates and production details are not copied.</p>
    <div className={styles.createActions}><button className="btn btn-pink" disabled={!sourceId||!createProduction||!newName.trim()||(useDraft&&!canUseDraft)} onClick={()=>void run(reviewCreate)}>Review template</button><button className="btn btn-light" onClick={()=>{setView('browse');setMessage('');}}>Cancel</button></div>
   </fieldset>}
   {view==='browse'&&!pending&&!apply&&mode!=='trash'&&writeProduction&&<div className={styles.secondary}><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>{setMode('trash');setSelected(null);void run(current=>refresh(current,production,'trash'));}}>Deleted templates</button></div>}

   {pending&&<section className={styles.confirmation} aria-label="Template change review"><h3>{operationLabel[pending.attempt.operation]}: {pending.attempt.previewName}</h3>
    <p>{pending.attempt.operation==='create'?'Save this schedule layout as a template.':pending.attempt.operation==='import'?'Import the reviewed browser content into the selected production only. Original browser data and files stay untouched.':pending.attempt.operation==='publish'?'Make this template available across your organization.':pending.attempt.operation==='unpublish'?'Keep this template in its production only. Existing copies are unchanged.':pending.attempt.operation==='trash'?'Move this template to Trash and stop sharing it. You can restore it later.':pending.attempt.operation==='restore'?'Restore this template to its production.':pending.attempt.operation==='rename'?'Save the new template name.':'Replace the saved template with the current schedule layout. You can share the updated template afterward.'}</p>
    {pending.attempt.name&&pending.attempt.operation==='rename'&&<p>Name: {pending.attempt.name}</p>}
    {['create','replace','import'].includes(pending.attempt.operation)&&<details className={styles.preview}><summary>Preview template</summary><TemplateRowsPreview rows={pending.attempt.previewRows??[]}/></details>}

   </section>}
   {apply&&<section className={styles.confirmation} aria-label="Apply template review"><h3>Apply {apply.review.template.name}</h3><p>Replace the current action list with this template. You can Undo before saving.</p>
    <details className={styles.preview}><summary>Preview template</summary><TemplateRowsPreview rows={apply.review.template.rows}/></details>

   </section>}
  </Modal></ModalVisibilityContext.Provider>
 </section>;
}
