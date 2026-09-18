'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import {captureMfaAttempt,createMfaPolicyRepository,MFA_ROLES,MfaPolicyError,type MfaAttempt,type MfaPolicy,type MfaRole} from '@/lib/platform/mfa-policy';
export default function LocalOrganizationSecurity(){
 const {client,session,organization,authNeeded,active,requireAuth}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createMfaPolicyRepository(client),[client]);
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
 return <section aria-label="Organization security settings"><button disabled={!ready||busy} onClick={()=>setOpen(v=>!v)}>Organization security</button>
 {open&&<div><h2>Organization security</h2><p>{organization?.name}. Organization Super Admins always require MFA; this cannot be disabled.</p><p role="status">{message}</p>
 {!record&&<button disabled={busy} onClick={()=>void run(async current=>{const r=await repo.read(actor!,org!);if(current()){setRecord(r);setRoles(r.required_roles);}})}>Load security settings</button>}
 <fieldset disabled={!ready||!record?.can_manage||busy||!!pending}><legend>Also require MFA for</legend>{MFA_ROLES.map(role=><label key={role} style={{display:'block'}}><input type="checkbox" checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/>{role==='admin'?'Organization Admin':role==='organizer'?'Production Organizer':role==='editor'?'Editor':'Viewer'}</label>)}</fieldset>
 <p>Changes apply on the next protected request. Ordinary schedule saves do not ask for a new code.</p>
 {record?.can_manage&&<button disabled={!ready||busy||!dirty} onClick={()=>void run(async current=>{
  const a=pending??captureMfaAttempt({actor:actor!,organization:org!,request:crypto.randomUUID(),version:record.version,roles});setPending(a);
  try{await repo.save(a);}catch(e){if(current()&&e instanceof MfaPolicyError&&e.kind==='conflict')setPending(null);throw e;}
  if(!current())return;setPending(null);const r=await repo.read(actor!,org!);if(current()){setRecord(r);setRoles(r.required_roles);setMessage('Organization MFA policy saved.');}
 })}>{pending?'Retry exact security request':'Save MFA policy'}</button>}
 <button disabled={!ready||busy||!!pending} onClick={()=>void run(async current=>{const r=await repo.read(actor!,org!);if(current()){setRecord(r);setMessage('Current policy version reviewed. Your draft is retained; save deliberately to replace this version.');}})}>Review current policy version</button>
 <button disabled={!ready||busy||!!pending} onClick={()=>{if(record)setRoles(record.required_roles);setMessage('Saved policy restored.');}}>Discard policy draft</button>
 </div>}</section>;
}
