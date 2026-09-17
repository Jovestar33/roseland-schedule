'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocalWorkspace, useWorkspacePanelState } from '@/components/local/LocalWorkspaceContext';
import { ScheduleLifecycleController, type ScheduleHistory } from '@/lib/platform/schedule-lifecycle-controller';
import { createLifecycleRepository, type LifecycleDay, type LifecycleFilter, type LifecycleSummary, type HistorySummary } from '@/lib/platform/schedule-lifecycle-repository';
import { ScheduleRepositoryError, type ScheduleLifecycle, type StoredSchedule } from '@/lib/platform/schedule-repository';
import ScheduleReadView from '@/components/view/ScheduleReadView';
import type { ScheduleData } from '@/lib/types';
import styles from '../local-invitations/invitations.module.css';
import lifecycleStyles from './lifecycle.module.css';
const labels:Record<ScheduleLifecycle|string,string>={create:'Create schedule',rename:'Rename schedule',archive:'Archive schedule',unarchive:'Unarchive schedule',delete:'Move to deleted',restore:'Recover schedule',restore_version:'Restore document version'};
const messages={invalid:'Check the name, address name, day and operation details.',unauthenticated:'Sign in again with the same account. Your review and drafts are retained.',unavailable:'This schedule or action is unavailable to the current account. Your review is retained.',conflict:'The saved version, address name or status conflicts. Keep this review, inspect the saved result, then refresh before preparing a different request.',failed:'The result is uncertain. Check the saved result or retry the exact reviewed identity and version.'};
export default function LocalLifecycleClient(){
  const workspace=useLocalWorkspace()!;
  const [repo]=useState(()=>createLifecycleRepository(workspace.client)),[controller]=useState(()=>new ScheduleLifecycleController());
  const [,redraw]=useState(0),refresh=()=>redraw(value=>value+1);
  const actor=useRef<string|null>(null),generation=useRef(0),busyRef=useRef(false),listTicket=useRef(0);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('Choose a saved schedule or create a blank schedule in an authorized day.');
  const [filter,setFilter]=useState<LifecycleFilter>('active'),[items,setItems]=useState<LifecycleSummary[]>([]),[more,setMore]=useState(false);
  const [days,setDays]=useState<LifecycleDay[]>([]),[dayMore,setDayMore]=useState(false),[dayCursor,setDayCursor]=useState<string|undefined>();
  const [day,setDay]=useState(''),[createName,setCreateName]=useState(''),[createSlug,setCreateSlug]=useState('');
  const [record,setRecord]=useState<StoredSchedule|null>(null),[renameName,setRenameName]=useState(''),[renameSlug,setRenameSlug]=useState('');
  const [permission,setPermission]=useState<{id:string;token:string;allowed:boolean;organize:boolean;trash:boolean}|null>(null);
  const [history,setHistory]=useState<HistorySummary[]>([]),[historyMore,setHistoryMore]=useState(false),[preview,setPreview]=useState<ScheduleHistory|null>(null);
  const [confirmation,setConfirmation]=useState<{title:string;text:string;label:string;action:()=>void}|null>(null),dialog=useRef<HTMLDialogElement>(null),review=useRef<HTMLElement>(null);
  const ready=!!workspace.session&&!workspace.authNeeded;
  const canEdit=permission?.id===record?.id&&permission?.token===workspace.session?.access_token&&permission?.allowed===true;
  const canOrganize=permission?.id===record?.id&&permission?.token===workspace.session?.access_token&&permission?.organize===true;
  const canTrash=permission?.id===record?.id&&permission?.token===workspace.session?.access_token&&permission?.trash===true;
  const renameDirty=!!record&&(renameName!==record.display_name||renameSlug!==record.slug);
  const dirty=!!controller.attempt||!!createName||!!createSlug||!!day||renameDirty;
  const attempt=controller.attempt;
  useWorkspacePanelState(dirty,busy);
  useEffect(()=>{const epoch=generation;return()=>{epoch.current++;controller.bind(null);};},[controller]);
  useEffect(()=>{if(confirmation&&workspace.active)dialog.current?.showModal();else dialog.current?.close();},[confirmation,workspace.active]);
  useEffect(()=>{if(attempt&&workspace.active)review.current?.focus();},[attempt,workspace.active]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function failure(error:unknown){const kind=error instanceof ScheduleRepositoryError?error.kind:'failed';setMessage(messages[kind]);if(kind==='unauthenticated')workspace.requireAuth();}
  async function run(action:()=>Promise<void>){if(busyRef.current)return;const stamp=generation.current;busyRef.current=true;setBusy(true);try{await action();}catch(error){if(stamp===generation.current)failure(error);}finally{if(stamp===generation.current){busyRef.current=false;setBusy(false);refresh();}}}
  async function list(nextFilter=filter,append=false){const stamp=generation.current,ticket=++listTicket.current;const page=await repo.list(actor.current!,workspace.organization!.id,nextFilter,append?items.at(-1)?.id:undefined);if(stamp!==generation.current||ticket!==listTicket.current)return;setItems(previous=>append?[...previous,...page.items]:page.items);setMore(page.more);}
  async function destinations(append=false){const stamp=generation.current;const page=await repo.days(actor.current!,workspace.organization!.id,append?dayCursor:undefined);if(stamp!==generation.current)return;setDays(previous=>append?[...previous,...page.items]:page.items);setDayMore(page.more);setDayCursor(page.cursor);}
  async function access(value:StoredSchedule){const stamp=generation.current,token=workspace.session?.access_token;const [allowed,organize,trash]=await Promise.all(['edit','organize','trash'].map(action=>repo.canEdit(actor.current!,value.production_id,value.id,action)));if(stamp===generation.current&&token)setPermission({id:value.id,token,allowed,organize,trash});}
  async function loadHistory(value:StoredSchedule,append=false){const stamp=generation.current;const page=await repo.history(actor.current!,workspace.organization!.id,value.id,append?history.at(-1)?.version:undefined);if(stamp!==generation.current)return;setHistory(previous=>append?[...previous,...page.items]:page.items);setHistoryMore(page.more);}
  async function select(id:string){const stamp=generation.current;const value=await repo.read(actor.current!,workspace.organization!.id,id);if(stamp!==generation.current)return;setRecord(value);setRenameName(value.display_name);setRenameSlug(value.slug);setPreview(null);setHistory([]);await access(value);await loadHistory(value);setMessage('Saved schedule loaded. The editor draft is unchanged.');}
  function choose(id:string){const action=()=>void run(()=>select(id));if(renameDirty)setConfirmation({title:'Discard rename draft?',text:'Only this unsent rename draft will be replaced. Your editor and creation drafts stay retained.',label:'Discard rename draft',action});else action();}
  useEffect(()=>{
    const next=workspace.session;if(next){actor.current=next.user.id;controller.bind(next.user.id);}
    if(!workspace.active||!next||workspace.authNeeded||!workspace.organization)return;
    void run(async()=>{await list();await destinations();if(record)await access(record);});
    // Each retained panel is fixed to one organization; account changes remount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workspace.active,workspace.authNeeded,workspace.session?.access_token,workspace.organization?.role]);
  useEffect(()=>{const request=workspace.scheduleRequest;if(request?.target!=='lifecycle'||!workspace.active||!ready||busy||busyRef.current||request.organization!==workspace.organization?.id)return;if(attempt){setMessage('Finish the retained lifecycle review before opening another schedule.');return;}workspace.consumeScheduleRequest(request.sequence);choose(request.id);
    // Existing choose() retains rename-draft confirmation and server permission checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workspace.scheduleRequest?.sequence,workspace.active,ready,busy,!!attempt]);
  function prepare(kind:ScheduleLifecycle){if(!record||!ready||busyRef.current||attempt)return;try{controller.prepare(record,kind,kind==='rename'?{display_name:renameName.trim(),slug:renameSlug.trim()}:kind==='restore_version'?{version:preview?.version}:{},preview??undefined);refresh();setMessage('Review the saved identity and version before confirming. Editor drafts will remain retained.');}catch(error){failure(error);}}
  async function execute(checkOnly=false){await run(async()=>{const operation=controller.execute(repo,checkOnly);refresh();await operation;if(controller.failure)failure(new ScheduleRepositoryError(controller.failure));else if(controller.result?.state==='matched'){const value=controller.result.current!;setRecord(value);setRenameName(value.display_name);setRenameSlug(value.slug);setMessage(`Matching saved version ${controller.result.matchedVersion} confirmed. Current version is ${value.document_version}. Open it explicitly to replace an editor draft.`);await list();await loadHistory(value);await access(value);}else setMessage('No matching saved result is visible. This does not prove that a pending request failed. Keep the same identity and version.');});}
  function discard(){const action=()=>{controller.clear();refresh();setMessage('Local review cleared. Saved schedules and editor drafts are unchanged.');};if(controller.phase==='review')action();else setConfirmation({title:'Discard local lifecycle review?',text:'An earlier request may have completed. Clearing this review does not undo it. A new creation identity could create another schedule; check the saved result first.',label:'Discard local review',action});}
  return <div className={styles.page}><main className={styles.main}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL SCHEDULE REHEARSAL</span><h1>Schedule lifecycle</h1><p>{workspace.organization?.name}</p></div><span className={styles.badge}>Fictional data only</span></header>
    <p className={styles.notice}>Actions use a reviewed saved version. Unsaved editor and modal drafts stay in the Schedules screen. Opening a result there requires explicit discard when needed. No schedule is permanently deleted here.</p>
    <p role="status" aria-live="polite" className={styles.status}>{message}</p>
    <div className={styles.columns}>
      <section className={styles.card} aria-label="Create schedule"><h2>Create blank schedule</h2><form className={styles.form} onSubmit={event=>{event.preventDefault();if(!ready||busyRef.current||attempt)return;try{controller.prepareCreate(workspace.organization!.id,crypto.randomUUID(),day,createName.trim(),createSlug.trim());refresh();setMessage('Review the blank schedule and destination before confirming.');}catch(error){failure(error);}}}>
        <fieldset disabled={!ready||busy||!!attempt}><label>Production day<select required value={day} onChange={event=>setDay(event.target.value)}><option value="">Choose an editable day</option>{days.filter(item=>item.editable).map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label>New schedule name<input required maxLength={160} value={createName} onChange={event=>setCreateName(event.target.value)}/></label><label>New address name<input required maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="harbour-day" value={createSlug} onChange={event=>setCreateSlug(event.target.value)}/><small>Lowercase letters, numbers and hyphens; unique within the production.</small></label>
        </fieldset><button disabled={!ready||busy||!!attempt||!days.some(item=>item.id===day&&item.editable)}>Review creation</button>
        {dayMore&&<button type="button" className={styles.secondary} disabled={!ready||busy||!!attempt} onClick={()=>void run(()=>destinations(true))}>Load more days</button>}
        <button type="button" className={styles.secondary} disabled={busy||!!attempt} onClick={()=>{setDay('');setCreateName('');setCreateSlug('');}}>Clear creation draft</button>
        {!days.some(item=>item.editable)&&<p>No editable day is visible. Existing production/day setup and access are required.</p>}
      </form></section>
      <section className={styles.card} aria-label="Saved schedule discovery"><div className={styles.sectionTitle}><h2>Saved schedules</h2><button className={styles.secondary} disabled={!ready||busy} onClick={()=>void run(()=>list())}>Refresh schedules</button></div>
        <label>Schedule collection<select disabled={!ready||busy} value={filter} onChange={event=>{const value=event.target.value as LifecycleFilter;setFilter(value);void run(()=>list(value));}}><option value="active">Active</option><option value="archived">Archived</option><option value="deleted">Trash</option></select></label>
        <ul>{items.map(item=><li key={item.id}><strong>{item.display_name}</strong><p>{item.deleted_at?'Deleted':item.status} · version {item.document_version}</p><button className={styles.secondary} disabled={!ready||busy||!!attempt} onClick={()=>choose(item.id)}>Inspect {item.display_name}</button></li>)}</ul>
        {!items.length&&<p>No schedules in this collection are visible to this account.</p>}{more&&<button disabled={!ready||busy} onClick={()=>void run(()=>list(filter,true))}>Load more schedules</button>}
      </section>
    </div>
    {record&&<section className={styles.card} aria-label="Saved schedule details"><div className={styles.sectionTitle}><h2>{record.display_name}</h2><span className={styles.badge}>{record.deleted_at?'Deleted':record.status} · version {record.document_version}</span></div><p className={styles.identifier}>Schedule: {record.id}</p><p>Address name: {record.slug}</p>
      <div className={styles.actions}><button disabled={!ready||busy||!!record.deleted_at} onClick={()=>workspace.openSchedule(workspace.organization!.id,record.id)}>Open in editor</button><button className={styles.secondary} disabled={!ready||busy||!!attempt} onClick={()=>choose(record.id)}>Refresh saved details</button></div>
      {!canEdit&&<p>Read-only access to this saved schedule.</p>}
      {!record.deleted_at&&<form className={styles.form} onSubmit={event=>{event.preventDefault();prepare('rename');}}><fieldset disabled={!ready||busy||!!attempt||!canOrganize}><label>Schedule name<input required maxLength={160} value={renameName} onChange={event=>setRenameName(event.target.value)}/></label><label>Address name<input required maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={renameSlug} onChange={event=>setRenameSlug(event.target.value)}/></label></fieldset><button disabled={!ready||busy||!!attempt||!canOrganize}>Review rename</button></form>}
      <div className={styles.actions}>
        {!record.deleted_at&&<button className={styles.secondary} disabled={!ready||busy||!!attempt||!canOrganize||(record.status==='archived'&&!record.archived_from_status)} onClick={()=>prepare(record.status==='archived'?'unarchive':'archive')}>{record.status==='archived'?'Review unarchive':'Review archive'}</button>}
        {canTrash&&<button className={styles.secondary} disabled={!ready||busy||!!attempt||!canTrash} onClick={()=>prepare(record.deleted_at?'restore':'delete')}>{record.deleted_at?'Review recovery':'Review soft deletion'}</button>}
      </div>
      {record.status==='archived'&&!record.archived_from_status&&<p>This older archived record has no recorded prior status. Unarchive requires an explicit migration decision.</p>}
    </section>}
    {record&&<section className={styles.card} aria-label="Document history"><h2>Document history</h2><p>Restoring appends the selected document as a new version. Current name, identity, archive and deletion state stay unchanged. Editor drafts are retained separately.</p><ul>{history.map(item=><li key={item.version}><strong>Version {item.version}</strong><p>{new Date(item.created_at).toLocaleString()} · {item.metadata?'Document and metadata recorded':'Older document-only history'}</p><button className={styles.secondary} disabled={!ready||busy||!!attempt} onClick={()=>void run(async()=>{const value=await repo.historical(actor.current!,workspace.organization!.id,record.id,item.version);if(!value)throw new ScheduleRepositoryError('unavailable');setPreview(value);})}>Preview version {item.version}</button></li>)}</ul>{historyMore&&<button disabled={!ready||busy||!!attempt} onClick={()=>void run(()=>loadHistory(record,true))}>Load older versions</button>}
      {preview&&<section aria-label="Historical document preview"><h3>Document from version {preview.version}</h3><div className={lifecycleStyles.preview}><ScheduleReadView data={preview.document as ScheduleData} name={record.display_name}/></div><button disabled={!ready||busy||!!attempt||!canEdit||!!record.deleted_at} onClick={()=>prepare('restore_version')}>Review document restore</button></section>}
    </section>}
    {attempt&&<section ref={review} tabIndex={-1} className={`${styles.card} ${styles.review}`} aria-label="Lifecycle request review"><div className={styles.sectionTitle}><h2>{labels[attempt.kind]}</h2><span className={styles.badge}>{controller.phase}</span></div><p>{workspace.organization?.name}</p><p className={styles.identifier}>Schedule: {attempt.id}</p><p>{attempt.kind==='create'?'Creation requires this identity to be absent.':`Expected saved version: ${attempt.expectedVersion}`}</p>
      {attempt.kind==='create'&&<p>{attempt.name} · {attempt.slug}<br/>{days.find(item=>item.id===attempt.dayId)?.label??attempt.dayId}<br/>Creates an empty document.</p>}
      {attempt.kind==='rename'&&<p>New name: {String(attempt.payload.display_name)} · {String(attempt.payload.slug)}</p>}
      {attempt.kind==='restore_version'&&<p>Source document version: {Number(attempt.payload.version)}. This replaces the saved document and appends history; your unsaved editor draft is retained.</p>}
      {attempt.kind==='delete'&&<p>Move this saved schedule to Deleted. An authorized Organizer or organization leader can recover it if its parents and address name remain available.</p>}
      {controller.failure&&<p role="alert">{messages[controller.failure]}</p>}
      {controller.result?.state==='matched'&&<p>Matching stored version {controller.result.matchedVersion} is confirmed. Latest visible version: {controller.result.current?.document_version}. A matching history entry confirms saved state; it is not a separate request receipt.</p>}
      <div className={styles.actions}>{controller.phase==='success'?<button disabled={busy} onClick={()=>{if(attempt.kind==='create'){setCreateName('');setCreateSlug('');setDay('');}controller.clear();refresh();setMessage('Result acknowledged. Review current saved details before another action.');}}>Acknowledge lifecycle result</button>:<>
        <button disabled={!ready||busy||controller.phase==='conflict'} onClick={()=>void execute()}>{controller.phase==='review'?'Confirm '+labels[attempt.kind].toLowerCase():'Retry same lifecycle request'}</button>
        <button className={styles.secondary} disabled={!ready||busy} onClick={()=>void execute(true)}>Check saved result</button>
        <button className={styles.secondary} disabled={busy} onClick={discard}>{controller.phase==='review'?'Back to lifecycle draft':'Discard local lifecycle review'}</button>
      </>}</div>
    </section>}
    <dialog ref={dialog} className={styles.dialog} aria-label={confirmation?.title??'Confirm lifecycle action'} onCancel={()=>setConfirmation(null)}><h2>{confirmation?.title}</h2><p>{confirmation?.text}</p><div className={styles.actions}><button className={styles.secondary} onClick={()=>setConfirmation(null)}>Keep working</button><button onClick={()=>{const action=confirmation?.action;setConfirmation(null);action?.();}}>{confirmation?.label}</button></div></dialog>
  </main></div>;
}
