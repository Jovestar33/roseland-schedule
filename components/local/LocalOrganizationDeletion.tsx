'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import styles from './administration-controls.module.css';
import {captureLifecycleAttempt,createOrganizationLifecycleRepository,LifecycleError,type LifecycleAttempt,type OrganizationLifecycle} from '@/lib/platform/organization-lifecycle';
export default function LocalOrganizationDeletion({showControls=true}:{showControls?:boolean}){
 const {hosted,client,session,organization,authNeeded,active,requireAuth,onLifecycleChange,lifecycleRevision}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createOrganizationLifecycleRepository(client,{hosted}),[client,hosted]);
 const [record,setRecord]=useState<OrganizationLifecycle|null>(null),[pending,setPending]=useState<LifecycleAttempt|null>(null),[open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false),[name,setName]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),working=useRef(false),latest=useRef({actor,org,ready});latest.current={actor,org,ready};
 useWorkspacePanelState(!!pending||confirmed||!!name,busy);
 async function load(){const r=await repo.read(actor!,org!);if(latest.current.actor===actor&&latest.current.org===org&&latest.current.ready){setRecord(r);onLifecycleChange?.(r);}return r;}
 async function run(work:()=>Promise<void>){if(!ready||!active||working.current)return;working.current=true;setBusy(true);const who=actor;
 try{await work();}catch(e){if(latest.current.actor===who){setMessage(e instanceof LifecycleError&&e.kind==='mfa'?'Confirm your identity, then retry this change.':e instanceof LifecycleError&&e.kind==='conflict'?'The deletion status changed or its cancellation deadline passed. Refresh the status before continuing.':'We couldn’t confirm the change. Retry to check the same request.');if(e instanceof LifecycleError&&e.kind==='auth')requireAuth();}}finally{working.current=false;setBusy(false);}}
 useEffect(()=>{if(!ready||!active)return;const refresh=()=>{if(!working.current)void load().catch(()=>{});};refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
 // Each actor/organization has its own mounted panel; returned reads are fenced.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,active,actor,org,session?.access_token,lifecycleRevision]);
 async function submit(operation:'request'|'cancel'){
 const a=pending??captureLifecycleAttempt({actor:actor!,organization:org!,request:crypto.randomUUID(),version:record!.version,operation,confirmed:operation==='cancel'||confirmed&&name===organization?.name});setPending(a);
 try{await repo.save(a);}catch(e){if(latest.current.actor===actor&&e instanceof LifecycleError&&e.kind==='conflict'){setPending(null);setConfirmed(false);}throw e;}
 if(latest.current.actor!==actor)return;setPending(null);setConfirmed(false);setName('');setMessage('Organization status updated.');
 const r=await load();let failed=false;
 for(const n of r.notifications.filter(n=>n.event_id===a.request)){try{if(await repo.notify(actor!,org!,n.event_id,n.recipient_id)!=='delivered')failed=true;}catch{failed=true;}}
 if(latest.current.actor===actor){setMessage(failed?'Organization status updated. Some notification emails need another attempt.':'Organization status updated. Notification details are below.');await load();}
 }
 return <section className={styles.panel} aria-label="Organization deletion settings">
 {record?.read_only&&<div className={styles.feedback} role="status"><strong>{record.state==='awaiting_purge'?'Deletion window ended':'Deletion requested'}</strong><p>You can still view and export your work. Editing and automatic snapshots are paused.</p>{record.cancel_before&&<p>Cancel before {new Date(record.cancel_before).toLocaleString()} to restore editing.</p>}{record.state==='awaiting_purge'&&<p>The cancellation window has ended. Data has not been erased; a separate deletion process is required.</p>}</div>}
 {showControls&&record?.can_manage&&<button hidden={open} className="btn btn-light" aria-expanded={open} disabled={!ready||busy} onClick={()=>setOpen(true)}>Deletion &amp; recovery</button>}
 {showControls&&open&&record?.can_manage&&<div><div className={styles.heading}><h2>Organization deletion</h2><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>setOpen(false)}>Close</button></div><p className={styles.intro}>Request deletion of <strong>{organization?.name}</strong>. Editing pauses immediately, with 30 days to cancel. Data removal requires a separate process; billing is managed separately.</p><p role="status" className={styles.feedback}>{message}</p>
 <button className="btn btn-light" disabled={!ready||busy||!!pending} onClick={()=>void run(async()=>{await load();setConfirmed(false);setMessage('Status refreshed. Review the details before confirming.');})}>Refresh status</button>
 {record.can_request&&!pending&&<fieldset className={styles.fields} disabled={!ready||busy}><legend>Confirm deletion request</legend><label>Type the organization name<input autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I understand that editing in {organization?.name} will pause immediately.</label></fieldset>}
 <div className={styles.actions}>
 {(record.can_request||pending?.operation==='request')&&<button className={`btn btn-danger ${styles.deleteRequest}`} disabled={!ready||busy||(!pending&&(!confirmed||name!==organization?.name))} onClick={()=>void run(()=>submit('request'))}>{pending?'Retry deletion request':'Request deletion'}</button>}
 {(record.can_cancel||pending?.operation==='cancel')&&<button className="btn btn-pink" disabled={!ready||busy} onClick={()=>void run(()=>submit('cancel'))}>{pending?'Retry cancellation':'Cancel deletion'}</button>}
 {!pending&&(confirmed||name)&&<button className="btn btn-light" disabled={busy} onClick={()=>{setName('');setConfirmed(false);setOpen(false);}}>Cancel</button>}
 </div>
 {record.notifications.length>0&&<section className={styles.review} aria-label="Deletion notifications"><h3>Notifications</h3><ul className={styles.notifications}>{record.notifications.map(n=><li key={n.event_id+':'+n.recipient_id}><div><strong>{n.recipient_name}</strong><p>{n.event_kind==='deletion_requested'?'Deletion request':'Deletion cancelled'} · {n.delivery_state==='delivered'?'Sent':n.delivery_state==='uncertain'?'Delivery not confirmed':'Needs attention'}</p></div>{n.delivery_state!=='delivered'&&<button className="btn btn-light btn-sm" disabled={!ready||busy} onClick={()=>void run(async()=>{const state=await repo.notify(actor!,org!,n.event_id,n.recipient_id);setMessage(state==='delivered'?(hosted?'The email service accepted the notification.':'Notice delivered to the local mail sink.'):'Notification not confirmed. Try again.');await load();})}>Retry notification</button>}</li>)}</ul></section>}
 </div>}</section>;
}
