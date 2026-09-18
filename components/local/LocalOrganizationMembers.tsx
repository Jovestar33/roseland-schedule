'use client';
import {useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import {captureMembershipAttempt,createMembershipRepository,MembershipError,type MembershipAttempt,type OrganizationMember} from '@/lib/platform/organization-members';
const roleName=(role:string)=>role==='owner'?'Organization Super Admin':role==='admin'?'Organization Admin':'Member';
export default function LocalOrganizationMembers(){
 const {client,session,organization,authNeeded,active,requireAuth}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createMembershipRepository(client),[client]);
 const [open,setOpen]=useState(false),[members,setMembers]=useState<OrganizationMember[]>([]),[more,setMore]=useState(false);
 const [selected,setSelected]=useState<OrganizationMember|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState<MembershipAttempt|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),working=useRef(false),latest=useRef({actor,ready});latest.current={actor,ready};
 useWorkspacePanelState(!!selected||!!pending,busy);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(!ready||!active||working.current)return;working.current=true;setBusy(true);const who=actor;
  try{await work(()=>latest.current.actor===who&&latest.current.ready);}catch(e){if(latest.current.actor===who){
   setMessage(e instanceof MembershipError&&e.kind==='mfa'?'Verify your authenticator, then retry the exact retained membership request.':e instanceof MembershipError&&e.kind==='conflict'?'Membership changed or the last active Super Admin is protected. Review current members before submitting again.':e instanceof MembershipError&&e.kind==='denied'?'Your current authority does not allow this membership change.':'Request not confirmed. Your draft and exact request are retained.');
   if(e instanceof MembershipError&&e.kind==='auth')requireAuth();
  }}finally{working.current=false;setBusy(false);}
 }
 async function load(current:()=>boolean,append=false){const rows=await repo.list(actor!,org!,append?members.at(-1)?.id??null:null);if(current()){setMore(rows.length>25);setMembers(old=>append?[...old,...rows.slice(0,25)]:rows.slice(0,25));}}
 async function deliver(event:string,current:()=>boolean){
  try{const state=await repo.notify(actor!,org!,event);if(current())setMessage(state==='delivered'?'Membership change confirmed; affected-member notice delivered to the local mail sink.':'Membership change confirmed; notification needs retry.');}
  catch{if(current())setMessage('Membership change confirmed; notification delivery is unconfirmed. Refresh members and retry the notice.');}
 }
 return <section aria-label="Organization membership management"><button disabled={!ready||busy} onClick={()=>{setOpen(v=>!v);if(!open)void run(c=>load(c));}}>Organization members</button>
 {open&&<div><h2>Organization members — {organization?.name}</h2><p role="status">{message}</p><p>Suspension affects this organization. Reinstatement retains the existing role and independent restrictions.</p>
 <button disabled={!ready||busy||!!pending} onClick={()=>void run(async c=>{await load(c);if(c()&&selected){const rows=await repo.list(actor!,org!);const row=rows.find(m=>m.id===selected.id);if(row){setSelected(row);setConfirmed(false);}else{setSelected(null);setReason('');}setMessage('Current membership reviewed. Confirm the named member again before submitting.');}})}>Review current members</button>
 <ul>{members.map(m=><li key={m.id}><strong>{m.name}</strong> — {roleName(m.role)}, {m.status}
 {m.can_manage&&<button disabled={!ready||busy||!!pending} onClick={()=>{setSelected(m);setReason('');setConfirmed(false);setMessage('');}}>{m.status==='active'?'Suspend':'Reinstate'} {m.name}</button>}
 {m.notification_id&&<span> — Latest notice: {m.notification_state}</span>}
 {m.pending_notifications?.map(n=><div key={n.event_id}>Undelivered {n.next_status==='active'?'reinstatement':'suspension'} notice (change {n.membership_revision}): {n.delivery_state} <button disabled={!ready||busy} onClick={()=>void run(async c=>{await deliver(n.event_id,c);await load(c);})}>Retry notice for {m.name}, change {n.membership_revision}</button></div>)}
 </li>)}</ul>
 {more&&<button disabled={!ready||busy} onClick={()=>void run(c=>load(c,true))}>More members</button>}
 {selected&&<fieldset disabled={!ready||busy||!!pending}><legend>{selected.status==='active'?'Suspend':'Reinstate'} {selected.name}</legend>
 <p>Role retained: {roleName(selected.role)}. {selected.status==='active'?'Access to this organization will be suspended.':'Existing production and schedule restrictions remain in effect; expired invitations stay expired.'}</p>
 <label>Reason <textarea value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this change for {selected.name} in {organization?.name}.</label></fieldset>}
 {(selected||pending)&&<button disabled={!ready||busy||(!pending&&(!confirmed||!reason.trim()))} onClick={()=>void run(async c=>{
  const a=pending??captureMembershipAttempt({actor:actor!,organization:org!,member:selected!.id,revision:selected!.revision,request:crypto.randomUUID(),status:selected!.status==='active'?'suspended':'active',reason,confirmed});setPending(a);
  let result;try{result=await repo.save(a);}catch(e){if(c()&&e instanceof MembershipError&&e.kind==='conflict'){setPending(null);setConfirmed(false);}throw e;}
  if(!c())return;setPending(null);setSelected(null);setReason('');setConfirmed(false);setMessage('Membership request confirmed.');
  if(result.notification_id)await deliver(result.notification_id,c);await load(c);
 })}>{pending?'Retry exact membership request':'Confirm membership change'}</button>}
 {selected&&!pending&&<button disabled={busy} onClick={()=>{setSelected(null);setReason('');setConfirmed(false);}}>Cancel membership draft</button>}
 </div>}</section>;
}
