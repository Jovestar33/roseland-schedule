'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import {captureMfaAttempt,createMfaPolicyRepository,MFA_ROLES,MfaPolicyError,type MfaAttempt,type MfaPolicy,type MfaRole} from '@/lib/platform/mfa-policy';
import styles from './administration-controls.module.css';
export default function LocalOrganizationSecurity(){
 const {client,session,organization,authNeeded,active,requireAuth}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createMfaPolicyRepository(client),[client]);
 const [comparison,setComparison]=useState<MfaPolicy|null>(null);
 const [record,setRecord]=useState<MfaPolicy|null>(null),[roles,setRoles]=useState<MfaRole[]>([]),[pending,setPending]=useState<MfaAttempt|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),working=useRef(false),latest=useRef({actor,ready});latest.current={actor,ready};
 const dirty=!!pending||!!record&&JSON.stringify(roles.slice().sort())!==JSON.stringify(record.required_roles.slice().sort());
 useWorkspacePanelState(dirty,busy);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(!ready||!active||working.current)return;working.current=true;setBusy(true);const who=actor;
  try{await work(()=>latest.current.actor===who&&latest.current.ready);}catch(e){if(latest.current.actor===who){
   setMessage(e instanceof MfaPolicyError&&e.kind==='mfa'?'Verify your authenticator, then retry the exact retained policy request.':e instanceof MfaPolicyError&&e.kind==='conflict'?'Policy changed elsewhere. Review current settings; your draft is retained.':'Request not confirmed. Your draft and exact request are retained.');
   if(e instanceof MfaPolicyError&&e.kind==='auth')requireAuth();
  }}finally{working.current=false;setBusy(false);}
 }
 useEffect(()=>{if(ready&&active&&!record)void run(async current=>{const r=await repo.read(actor!,org!);if(current()){setRecord(r);setRoles(r.required_roles);}});
 // Each organization panel keeps its own draft through same-actor step-up.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,active,actor,org,session?.access_token]);
 return <section className={styles.panel} aria-label="Organization security settings"><button hidden={open} className="btn btn-light" aria-expanded={open} disabled={!ready||busy} onClick={()=>setOpen(v=>!v)}>{open?'Close':'Sign-in requirements'}</button>
 {open&&<div><div className={styles.heading}><h2>Two-step verification</h2><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>setOpen(false)}>Close</button></div><p className={styles.intro}>Super Admins always need two-step verification. For other roles, choose whether it is required or optional.</p><p className={styles.feedback} role="status">{message}</p>
 {!record&&<button disabled={busy} onClick={()=>void run(async current=>{const r=await repo.read(actor!,org!);if(current()){setRecord(r);setRoles(r.required_roles);}})}>Load security settings</button>}
 <fieldset className={styles.roles} disabled={!ready||!record?.can_manage||busy||!!pending}><legend>Require two-step verification for</legend>{MFA_ROLES.map(role=><label className={styles.check} key={role}><input type="checkbox" checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/>{role==='admin'?'Organization Admin':role==='organizer'?'Production Organizer':role==='editor'?'Editor':'Viewer'}</label>)}</fieldset>
 <p className={styles.intro}>Unchecked roles can choose to set it up themselves. Normal schedule editing does not require a new code each time.</p><div className={styles.actions}>
 {record?.can_manage&&<button className="btn btn-pink" disabled={!ready||busy||!dirty} onClick={()=>void run(async current=>{
  const a=pending??captureMfaAttempt({actor:actor!,organization:org!,request:crypto.randomUUID(),version:record.version,roles});setPending(a);
  try{await repo.save(a);}catch(e){if(current()&&e instanceof MfaPolicyError&&e.kind==='conflict')setPending(null);throw e;}
  if(!current())return;setPending(null);const r=await repo.read(actor!,org!);if(current()){setRecord(r);setRoles(r.required_roles);setComparison(null);setMessage('Sign-in requirements saved.');}
 })}>{pending?'Retry save':'Save changes'}</button>}
 <button className="btn btn-light" disabled={!ready||busy||!!pending} onClick={()=>void run(async current=>{const r=await repo.read(actor!,org!);if(current()){if(dirty){setComparison(r);setMessage('Compare the saved requirements below before replacing your changes.');}else{setRecord(r);setRoles(r.required_roles);setMessage('Settings refreshed.');}}})}>{dirty?'Compare saved settings':'Refresh'}</button>
 <button className="btn btn-light" disabled={!ready||busy||!!pending||!dirty} onClick={()=>{if(record)setRoles(record.required_roles);setComparison(null);setMessage('Unsaved changes cancelled.');}}>Cancel changes</button></div>
 {comparison&&<section className={styles.review}><h3>Currently saved</h3><p>Required for Super Admins{comparison.required_roles.length?', '+comparison.required_roles.map(role=>role==='admin'?'Organization Admins':role==='organizer'?'Production Organizers':role==='editor'?'Editors':'Viewers').join(', '):' only'}.</p><div className={styles.actions}><button className="btn btn-light" disabled={!ready||busy||!!pending} onClick={()=>{setRecord(comparison);setRoles(comparison.required_roles);setComparison(null);setMessage('Saved settings loaded.');}}>Use saved settings</button><button className="btn btn-light" disabled={!ready||busy||!!pending} onClick={()=>{setRecord(comparison);setComparison(null);setMessage('Your changes are retained. Choose Save changes to apply them.');}}>Keep my changes</button></div></section>}
 </div>}</section>;
}
