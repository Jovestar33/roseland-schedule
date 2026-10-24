'use client';
import {useRef,useState} from 'react';
import Modal from '@/components/modals/Modal';
import LocalTrialSyncReview from './LocalTrialSyncReview';
import LocalTrialSyncComparison from './LocalTrialSyncComparison';
import {useLocalWorkspace} from './LocalWorkspaceContext';
import styles from './trial-sync-review.module.css';
type Mapping={id:string;schedule_id:string;legacy_key:string;status:string;checked_at:string|null;completed_at:string|null};
type Inventory={checked_at:string;legacy_unmapped:string[];legacy_missing:string[];target_unmapped:{id:string;name:string}[];target_missing:string[]};
type Status={configured:boolean;id?:string;revision?:number;enabled?:boolean;authorized?:boolean;legacy_origin?:string;mappings?:Mapping[];inventory?:Inventory|null};
const labels:Record<string,string>={'imported-awaiting-live-check':'Imported · Automatic checks have not started',synced:'Up to date',unchanged:'Up to date','content-conflict':'Both copies changed','structure-conflict':'Organization or placement changed','initial-conflict':'Starting copies differ',uncertain:'Save needs verification',unavailable:'Connection or permission needs attention','changed-before-write':'Changed during check',pending:'Save in progress',uninitialized:'Not yet compared'};
export default function LocalTrialSync(){
 const workspace=useLocalWorkspace()!,{client,session,organization,active,authNeeded}=workspace;
 const [open,setOpen]=useState(false),[status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [reviewId,setReviewId]=useState<string|null>(null),[resolving,setResolving]=useState(false);
 const ticket=useRef(0),running=useRef(false),scope=useRef('');scope.current=`${session?.user.id}:${organization?.id}:${active}:${authNeeded}`;
 if(!workspace.hosted||organization?.role!=='owner')return null;
 async function load(toggle?:boolean){
  if(running.current||!active||authNeeded||!session||!organization)return;
  running.current=true;setBusy(true);setMessage('');const current=scope.current,n=++ticket.current;
  const valid=()=>scope.current===current&&ticket.current===n;
  try{
   const fresh=await client.auth.getSession();if(fresh.error||fresh.data.session?.user.id!==session.user.id)throw Error('Sign in again to review synchronization.');
   const token=fresh.data.session.access_token;
   if(toggle!==undefined){
    if(!status?.id||!Number.isSafeInteger(status.revision))throw Error('Refresh status before changing synchronization.');
    const changed=await client.rpc('set_trial_sync_enabled',{target_integration_id:status.id,expected_revision:status.revision,next_enabled:toggle}).setHeader('Authorization',`Bearer ${token}`);
    if(changed.error)throw Error(changed.error.code==='PT409'?'The sync setup changed. Refresh status and review it again.':changed.error.code==='PT403'?'Confirm your authenticator in Account security, then try again.':'The change was not confirmed. Refresh status before retrying.');
   }
   const result=await client.rpc('read_trial_sync_status',{target_organization_id:organization.id}).setHeader('Authorization',`Bearer ${token}`);
   if(result.error)throw Error(toggle===undefined?'Synchronization status is unavailable. No setting was changed by this status check.':'The setting may have been saved, but its status could not be verified. Refresh status before retrying.');
   const value=result.data;if(!value||typeof value.configured!=='boolean'||value.configured&&(!Array.isArray(value.mappings)||typeof value.enabled!=='boolean'||typeof value.legacy_origin!=='string'||!/^https:\/\/[a-z0-9-]+[.]netlify[.]app$/.test(value.legacy_origin)))throw Error('The status response could not be verified.');
   if(value.inventory){const i=value.inventory;if(!Number.isFinite(Date.parse(i.checked_at))||!['legacy_unmapped','legacy_missing','target_missing'].every(k=>Array.isArray(i[k])&&i[k].every((x:unknown)=>typeof x==='string'))||!Array.isArray(i.target_unmapped)||!i.target_unmapped.every((x:{id?:unknown;name?:unknown})=>x&&typeof x.id==='string'&&typeof x.name==='string'))throw Error('The inventory response could not be verified.');}
   if(valid()){setStatus(value);setMessage(toggle===undefined?'':toggle?'Synchronization resumed. The next check will compare both copies.':'Synchronization paused. Both apps retain their saved changes.');}
  }catch(e){if(valid())setMessage(e instanceof Error?e.message:'Status unavailable.');}
  finally{running.current=false;if(ticket.current===n)setBusy(false);}
 }
 const rows=status?.mappings??[],stale=(r:Mapping)=>!r.completed_at||Date.now()-Date.parse(r.completed_at)>300000,attention=rows.filter(r=>!['synced','unchanged'].includes(r.status)||stale(r));
 const inventory=status?.inventory,inventoryStale=!inventory||Date.now()-Date.parse(inventory.checked_at)>300000,inventoryCount=inventory?inventory.legacy_unmapped.length+inventory.legacy_missing.length+inventory.target_unmapped.length+inventory.target_missing.length:0;
 return <section className={styles.overview} aria-label="Trial synchronization">
  <p>Keep the two schedule apps connected during the trial. If both copies change, syncing stops for that schedule so you can review them.</p>
  <button className="btn btn-light" onClick={()=>{setOpen(true);void load();}}>Review synchronization</button>
  <Modal open={open&&active&&!authNeeded} beforeClose={()=>!resolving} onClose={()=>{setOpen(false);setReviewId(null);}} title="Trial synchronization" className="template-modal trial-sync-modal" footer={reviewId?null:<><button className="btn btn-light" onClick={()=>setOpen(false)}>Close</button><button className="btn btn-light" disabled={busy} onClick={()=>void load()}>Refresh status</button>{status?.configured&&<button className={status.enabled?'btn btn-light':'btn btn-pink'} disabled={busy} onClick={()=>void load(!status.enabled)}>{status.enabled?'Pause synchronization':'Resume synchronization'}</button>}</>}>
   {reviewId?<LocalTrialSyncReview key={reviewId} mappingId={reviewId} onSaving={setResolving} onBack={()=>{setReviewId(null);void load();}} onResolved={()=>void load()}/>:<>
   <LocalTrialSyncComparison />
   {(busy||message)&&<p className={styles.notice} role="status">{busy?'Checking synchronization…':message}</p>}
   {status&&!status.configured&&<p>The trial connection is being prepared. Your schedules are not being synchronized yet.</p>}
   {status?.configured&&<>
    <h3>Automatic synchronization</h3>
    <h4>{!status.enabled?'Paused':!status.authorized?'Permission needs attention':attention.length||inventoryCount||inventoryStale?'Schedules need review':'Synchronization enabled'}</h4>
    <p>{rows.length} {rows.length===1?'schedule':'schedules'} connected. {attention.length} need a completed automatic check or review. Compare copies only checks the saved content; it does not start synchronization.</p>
    {inventoryStale&&<p role="status">The full library check is overdue. Refresh the status to confirm which schedules are connected.</p>}
    {!!inventoryCount&&<div><h4>Schedules needing connection review</h4><p>{inventoryCount} library {inventoryCount===1?'difference':'differences'} found. New schedules are not connected automatically; missing entries may have been renamed, moved or deleted.</p><details><summary>Review library differences</summary><ul>{inventory!.legacy_unmapped.map(key=><li key={'new:'+key}>Legacy app, not connected: {key}</li>)}{inventory!.legacy_missing.map(key=><li key={'missing:'+key}>Legacy app, no longer found: {key}</li>)}{inventory!.target_unmapped.map(row=><li key={row.id}>New app, not connected: {row.name}</li>)}{inventory!.target_missing.length>0&&<li>{inventory!.target_missing.length} connected schedules are no longer available in the new app.</li>}</ul></details></div>}
    <p>During the trial, review new or renamed schedules and library changes separately. Templates and schedule placement are not copied automatically.</p>
    <div style={{display:'grid',gap:12}}>{rows.map(row=><article key={row.id} style={{border:'1px solid var(--g200, #e5e7eb)',borderRadius:12,padding:16,display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:16}}>
     <div style={{minWidth:0,flex:'1 1 280px'}}><h4 style={{margin:'0 0 6px',overflowWrap:'anywhere'}}>{row.legacy_key}</h4><p style={{margin:0}}>{labels[row.status]??'Needs review'}{stale(row)&&' · Check overdue'}</p><p style={{margin:'4px 0 0',fontSize:14}}>Last completed check: {row.completed_at?new Date(row.completed_at).toLocaleString():'Not checked yet'}</p></div>
     <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{['content-conflict','initial-conflict','uncertain','structure-conflict'].includes(row.status)&&<button className="btn btn-pink" onClick={()=>setReviewId(row.id)}>Review differences</button>}<button className="btn btn-light" onClick={()=>{setOpen(false);workspace.openSchedule(organization.id,row.schedule_id);}}>New app</button><a className="btn btn-light" href={`${status.legacy_origin}/schedule/${encodeURIComponent(row.legacy_key)}`} target="_blank" rel="noreferrer">Legacy app</a></div>
    </article>)}</div>
    {attention.length>0&&<p>Review both saved copies before making further changes. Both versions are kept in recovery history until you choose which copy to keep.</p>}
   </>}
   </>}
  </Modal>
 </section>;
}
