'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import {captureLifecycleAttempt,createOrganizationLifecycleRepository,LifecycleError,type LifecycleAttempt,type OrganizationLifecycle} from '@/lib/platform/organization-lifecycle';
export default function LocalOrganizationDeletion(){
 const {client,session,organization,authNeeded,active,requireAuth,onLifecycleChange,lifecycleRevision}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createOrganizationLifecycleRepository(client),[client]);
 const [record,setRecord]=useState<OrganizationLifecycle|null>(null),[pending,setPending]=useState<LifecycleAttempt|null>(null),[open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false),[name,setName]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),working=useRef(false),latest=useRef({actor,org,ready});latest.current={actor,org,ready};
 useWorkspacePanelState(!!pending||confirmed||!!name,busy);
 async function load(){const r=await repo.read(actor!,org!);if(latest.current.actor===actor&&latest.current.org===org&&latest.current.ready){setRecord(r);onLifecycleChange?.(r);}return r;}
 async function run(work:()=>Promise<void>){if(!ready||!active||working.current)return;working.current=true;setBusy(true);const who=actor;
 try{await work();}catch(e){if(latest.current.actor===who){setMessage(e instanceof LifecycleError&&e.kind==='mfa'?'Verify your authenticator, then retry the exact retained lifecycle request.':e instanceof LifecycleError&&e.kind==='conflict'?'Lifecycle changed or cancellation deadline passed. Review current status; your confirmation draft is retained.':'Request not confirmed. Your exact request and draft are retained.');if(e instanceof LifecycleError&&e.kind==='auth')requireAuth();}}finally{working.current=false;setBusy(false);}}
 useEffect(()=>{if(!ready||!active)return;const refresh=()=>{if(!working.current)void load().catch(()=>{});};refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
 // Each actor/organization has its own mounted panel; returned reads are fenced.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,active,actor,org,session?.access_token,lifecycleRevision]);
 async function submit(operation:'request'|'cancel'){
 const a=pending??captureLifecycleAttempt({actor:actor!,organization:org!,request:crypto.randomUUID(),version:record!.version,operation,confirmed:operation==='cancel'||confirmed&&name===organization?.name});setPending(a);
 try{await repo.save(a);}catch(e){if(latest.current.actor===actor&&e instanceof LifecycleError&&e.kind==='conflict'){setPending(null);setConfirmed(false);}throw e;}
 if(latest.current.actor!==actor)return;setPending(null);setConfirmed(false);setName('');setMessage('Lifecycle request confirmed.');
 const r=await load();let failed=false;
 for(const n of r.notifications.filter(n=>n.event_id===a.request)){try{if(await repo.notify(actor!,org!,n.event_id,n.recipient_id)!=='delivered')failed=true;}catch{failed=true;}}
 if(latest.current.actor===actor){setMessage(failed?'Lifecycle change confirmed. Some notices need retry.':'Lifecycle change confirmed. Review notification status below.');await load();}
 }
 return <section aria-label="Organization deletion settings">
 {record?.read_only&&<div role="status"><strong>{record.state==='awaiting_purge'?'Organization is awaiting purge.':'Organization deletion is pending.'}</strong> Existing authorized read and export remain available. Ordinary writes and automatic snapshots are paused; unsaved drafts are retained.{record.cancel_before&&<p>Cancellation deadline: {new Date(record.cancel_before).toLocaleString()}.</p>}{record.state==='awaiting_purge'&&<p>The cancellation window has ended. No automatic data erasure is implemented.</p>}</div>}
 {record?.can_manage&&<button disabled={!ready||busy} onClick={()=>setOpen(v=>!v)}>Organization deletion</button>}
 {open&&record?.can_manage&&<div><h2>Organization deletion — {organization?.name}</h2><p>Request a 30-day cancellation window. Ordinary writes pause immediately. A separate approved purge process would be needed afterward. Billing is separate.</p><p role="status">{message}</p>
 <button disabled={!ready||busy||!!pending} onClick={()=>void run(async()=>{await load();setConfirmed(false);setMessage('Current lifecycle reviewed. Confirm again before requesting deletion.');})}>Review organization status</button>
 {record.can_request&&!pending&&<fieldset disabled={!ready||busy}><legend>Confirm deletion request</legend><label>Organization name<input value={name} onChange={e=>setName(e.target.value)}/></label><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this request for {organization?.name}, including pausing ordinary writes.</label></fieldset>}
 {(record.can_request||pending?.operation==='request')&&<button disabled={!ready||busy||(!pending&&(!confirmed||name!==organization?.name))} onClick={()=>void run(()=>submit('request'))}>{pending?'Retry exact deletion request':'Request organization deletion'}</button>}
 {(record.can_cancel||pending?.operation==='cancel')&&<button disabled={!ready||busy} onClick={()=>void run(()=>submit('cancel'))}>{pending?'Retry exact cancellation':'Cancel organization deletion'}</button>}
 {!pending&&(confirmed||name)&&<button disabled={busy} onClick={()=>{setName('');setConfirmed(false);}}>Discard deletion draft</button>}
 <ul>{record.notifications.map(n=><li key={n.event_id+':'+n.recipient_id}>{n.event_kind==='deletion_requested'?'Deletion request':'Cancellation'} notice, change {n.lifecycle_version}: {n.delivery_state} <button disabled={!ready||busy} onClick={()=>void run(async()=>{const state=await repo.notify(actor!,org!,n.event_id,n.recipient_id);setMessage(state==='delivered'?'Notice delivered to the local mail sink.':'Notice needs retry.');await load();})}>Retry notice for {n.recipient_name}</button></li>)}</ul>
 </div>}</section>;
}
