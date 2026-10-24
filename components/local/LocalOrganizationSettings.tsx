'use client';
/* eslint-disable @next/next/no-img-element -- Validated embedded organization logos do not use image optimization. */
import {useEffect,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import Modal from '@/components/modals/Modal';
import {useCmsStore} from '@/lib/store/cmsStore';
import type {CmsConfig} from '@/lib/api/cms';
import {ACTIONS,ACTION_CLASS_MAP,CMS_COLORS,CMS_ACTION_STYLES} from '@/lib/constants';
import {capturePresentation,createPresentationRepository,PRESENTATION_LABELS,type PresentationAttempt,type PresentationRecord} from '@/lib/platform/organization-presentation';
import {journalEntries,journalWrite,journalClear} from '@/lib/platform/request-journal';
import {ScheduleRepositoryError} from '@/lib/platform/schedule-repository';
import styles from './administration-controls.module.css';

export default function LocalOrganizationSettings(){
 const workspace=useLocalWorkspace()!,{client,session,organization,active,authNeeded,requireAuth}=workspace;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const [repo]=useState(()=>createPresentationRepository(client));
 const [record,setRecord]=useState<PresentationRecord|null>(null),[draft,setDraft]=useState<CmsConfig>({}),[comparison,setComparison]=useState<PresentationRecord|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<PresentationAttempt|null>(null),[message,setMessage]=useState('');
 const draftRef=useRef(draft);draftRef.current=draft;
 const [tab,setTab]=useState<'labels'|'colors'|'actions'|'logo'>('labels');
 const ticket=useRef(0),busyRef=useRef(false),latest=useRef({actor,org,active,ready});latest.current={actor,org,active,ready};
 const storeKey=`roseland-presentation-request:${actor}:${org}`;
 function retainedRequest(){const entry=journalEntries(localStorage,storeKey)[0];if(!entry)return null;const value=capturePresentation(JSON.parse(entry.raw));if(value.actor!==actor||value.organization!==org)throw Error('Recovery scope mismatch');return value;}
 const dirty=!!pending||!!record&&JSON.stringify(draft)!==JSON.stringify(record.config);
 useWorkspacePanelState(dirty,busy);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(!ready||!active||busyRef.current)return;busyRef.current=true;setBusy(true);const seq=++ticket.current,a=actor,o=org;
  const current=()=>ticket.current===seq&&latest.current.actor===a&&latest.current.org===o&&latest.current.ready;
  try{await work(current);}catch(e){if(current()){setMessage(e instanceof ScheduleRepositoryError?e.kind==='conflict'?'Appearance changed elsewhere. Compare the saved settings before saving your changes.':e.kind==='unavailable'?'Organization settings are unavailable under current permissions. Your draft and request are retained.':e.kind==='invalid'?'The settings were rejected. Correct the draft and try again.':'We couldn’t confirm the request. Your changes are still here; retry to check the same save.':e instanceof Error?e.message:'Settings request failed.');if(e instanceof ScheduleRepositoryError&&e.kind==='unauthenticated')requireAuth();}}
  finally{if(seq===ticket.current){busyRef.current=false;setBusy(false);}}
 }
 useEffect(()=>{const counter=ticket,working=busyRef;setBusy(false);return()=>{counter.current++;working.current=false;};},[]);
 useEffect(()=>{
  if(!ready||!active)return;
  if(!record)void run(async current=>{const saved=await repo.read(actor!,org!);if(!current())return;setRecord(saved);let restored:PresentationAttempt|null=null;try{restored=retainedRequest();}catch{setMessage('Saved settings loaded, but the retained request could not be read. Original recovery data was left untouched.');}setPending(restored);setDraft(restored?.config??saved.config);if(restored)setMessage('A previous save needs checking. Retry to confirm its result.');});
  // Scope and session changes invalidate callbacks; drafts remain in their organization panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,active,actor,org,session?.access_token]);
 useEffect(()=>{if(!active)return;const config=ready&&record?(open?draft:record.config):{},title=document.title;useCmsStore.getState().setConfig(config);document.title=config.labels?.appTitle||'Roseland Schedule';return()=>{useCmsStore.getState().setConfig({});document.title=title;};},[active,ready,record,open,draft]);
 async function save(current:()=>boolean){
  if(!record)return;const a=pending??capturePresentation({actor:actor!,organization:org!,request:crypto.randomUUID(),version:record.version,config:draft});
  if(!pending){const raw=JSON.stringify(a);try{journalWrite(localStorage,storeKey,a.request,raw,old=>JSON.parse(old).request===a.request);}catch{throw Error('Recovery storage is unavailable. No settings request was sent.');}setPending(a);}
  try{await repo.save(a);}catch(e){if(current()&&e instanceof ScheduleRepositoryError&&['invalid','conflict'].includes(e.kind)){journalClear(localStorage,storeKey,a.request,raw=>JSON.parse(raw).request===a.request);setPending(null);}throw e;}
  if(!current())return;journalClear(localStorage,storeKey,a.request,raw=>JSON.parse(raw).request===a.request);setPending(null);const saved=await repo.read(actor!,org!);if(!current())return;setRecord(saved);const next=retainedRequest();setPending(next);setDraft(next?.config??saved.config);setComparison(null);setMessage(next?'Appearance saved. Another save still needs checking.':'Appearance saved.');
 }
 const writable=record?.can_manage===true;
 const actions=draft.actions??ACTIONS.filter(a=>a&&a!=='Other').map(name=>({name,color:ACTION_CLASS_MAP[name]??''}));
 function change(next:CmsConfig){setDraft(next);setComparison(null);}
 return <section className={styles.panel} aria-label="Organization presentation settings">
  <button className="btn btn-light" disabled={!ready||busy||!record} onClick={()=>setOpen(true)}>Organization appearance</button>
  {!record&&ready&&<button className="btn btn-light" disabled={busy} onClick={()=>void run(async current=>{const saved=await repo.read(actor!,org!);if(current()){setRecord(saved);setDraft(saved.config);setMessage('Organization appearance loaded.');}})}>Retry loading appearance</button>}
  {!open&&message&&<p role="status">{message}</p>}
  <Modal open={open&&active&&ready} onClose={()=>setOpen(false)} title="Organization appearance" className="template-modal appearance-modal" retainWhenHidden footer={<>
    <button className="btn btn-light" disabled={busy||!!pending} onClick={()=>{if(record)setDraft(record.config);setComparison(null);setOpen(false);setMessage('Preview cancelled. Saved settings restored.');}}>Cancel</button>
     {writable&&<button className="btn btn-pink" disabled={busy||!dirty} onClick={()=>void run(save)}>{pending?'Retry save':'Save appearance'}</button>}
   </>}>
   <p className="appearance-intro">Customize the look of {organization?.name}.{!writable&&' These settings are read-only for your account.'}</p>
   <p role="status">{message}</p>
   <nav aria-label="Appearance sections">{(['labels','colors','actions','logo'] as const).map(t=><button className="btn btn-light" key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
   <fieldset className={`appearance-fields appearance-${tab}`} disabled={!writable||busy||!!pending} style={{border:0,padding:0}}>
    {tab==='labels'&&PRESENTATION_LABELS.map(([key,label,def])=><label key={key}>{label}<input maxLength={160} placeholder={def} value={draft.labels?.[key]??''} onChange={e=>change({...draft,labels:{...draft.labels,[key]:e.target.value}})}/></label>)}
    {tab==='colors'&&<><h3>Brand palette</h3>{CMS_COLORS.map(({key,def})=><label key={key}>{key.slice(2)}<input aria-label={`${key.slice(2)} color picker`} type="color" value={draft.colors?.[key]??def} onChange={e=>change({...draft,colors:{...draft.colors,[key]:e.target.value}})}/><input aria-label={`${key.slice(2)} hex color`} maxLength={7} value={draft.colors?.[key]??def} onChange={e=>change({...draft,colors:{...draft.colors,[key]:e.target.value}})}/></label>)}<h3>Action row colors</h3>{CMS_ACTION_STYLES.map(({cls,defBg,defText})=><div key={cls}><label>{cls.slice(1)} background<input type="color" value={draft.actionStyles?.[cls]?.bg??defBg} onChange={e=>change({...draft,actionStyles:{...draft.actionStyles,[cls]:{bg:e.target.value,text:draft.actionStyles?.[cls]?.text??defText}}})}/></label><label>{cls.slice(1)} text<input type="color" value={draft.actionStyles?.[cls]?.text??defText} onChange={e=>change({...draft,actionStyles:{...draft.actionStyles,[cls]:{bg:draft.actionStyles?.[cls]?.bg??defBg,text:e.target.value}}})}/></label></div>)}</>}
    {tab==='actions'&&<><p>Reorder or rename future action choices. Existing schedule values remain intact. Other is always available.</p>{actions.map((a,i)=><div key={i}><label>Action {i+1} name<input maxLength={100} value={a.name} onChange={e=>change({...draft,actions:actions.map((v,n)=>n===i?{...v,name:e.target.value}:v)})}/></label><label>Action {i+1} style<select value={a.color} onChange={e=>change({...draft,actions:actions.map((v,n)=>n===i?{...v,color:e.target.value}:v)})}><option value="">No highlight</option>{CMS_ACTION_STYLES.map(s=><option key={s.cls} value={s.cls}>{s.cls.slice(1)}</option>)}</select></label><button className="btn btn-light" disabled={i===0} onClick={()=>{const next=[...actions];[next[i-1],next[i]]=[next[i],next[i-1]];change({...draft,actions:next});}}>Move action {i+1} up</button><button className="btn btn-light" onClick={()=>change({...draft,actions:actions.filter((_,n)=>n!==i)})}>Remove action {i+1}</button></div>)}<button className="btn btn-light" onClick={()=>change({...draft,actions:[...actions,{name:'New action',color:''}]})}>Add action</button></>}
    {tab==='logo'&&<><p>{draft.logo?'Your custom logo is shown below.':'The default Roseland logo is currently in use.'} Choose a file to preview a replacement. Save appearance applies it to this organization’s app header and documents; Cancel restores the saved logo.</p><img src={draft.logo||'/logo-header.png'} alt={draft.logo?'Custom organization logo preview':'Default Roseland logo preview'} style={{maxHeight:120,maxWidth:'100%',background:'#191919',padding:16,borderRadius:8}}/><label>Organization logo file<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>2000000){setMessage('Logo must be at most 2 MB. Nothing changed.');return;}const seq=++ticket.current;try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Logo could not be read'));reader.readAsDataURL(file);});if(seq===ticket.current&&latest.current.ready)change({...draftRef.current,logo:data});}catch{setMessage('Logo could not be read. Your draft is retained.');}}}/></label>{draft.logo&&<><button className="btn btn-light" onClick={()=>change({...draft,logo:null})}>Use default logo</button></>}</>}
   </fieldset>
   {pending&&<p>A previous save still needs checking. Retry uses the same changes and protects newer saved work.</p>}
   <div className={styles.actions}><button className="btn btn-light" disabled={busy||!!pending} onClick={()=>void run(async current=>{const saved=await repo.read(actor!,org!);if(current()){if(dirty){setComparison(saved);setMessage('Compare the saved appearance below. Your changes are still here.');}else{setRecord(saved);setDraft(saved.config);setMessage('Appearance refreshed.');}}})}>{dirty?'Compare saved appearance':'Refresh'}</button></div>
   {comparison&&<section className={styles.review} aria-label="Current saved settings"><h3>Saved appearance</h3><p>Review the saved version before replacing it or returning to it.</p><dl className={styles.summaryList}><div><dt>Labels</dt><dd>{Object.keys(comparison.config.labels??{}).length} custom labels</dd></div><div><dt>Colors</dt><dd>{Object.keys(comparison.config.colors??{}).length} custom brand colors</dd></div><div><dt>Actions</dt><dd>{comparison.config.actions?.length??ACTIONS.filter(a=>a&&a!=='Other').length} action choices</dd></div><div><dt>Logo</dt><dd>{comparison.config.logo?'Custom logo':'Default Roseland logo'}</dd></div></dl><details className={styles.technicalDetails}><summary>View all saved values</summary><pre>{JSON.stringify(comparison.config,null,2)}</pre></details><div className={styles.actions}><button className="btn btn-light" disabled={busy} onClick={()=>{setRecord(comparison);setDraft(comparison.config);setComparison(null);setMessage('Saved appearance loaded.');}}>Use saved appearance</button>{comparison.can_manage&&<button className="btn btn-light" disabled={busy} onClick={()=>{setRecord(comparison);setComparison(null);setMessage('Your changes are still here. Choose Save appearance to apply them.');}}>Keep my changes</button>}</div></section>}

  </Modal>
 </section>;
}
