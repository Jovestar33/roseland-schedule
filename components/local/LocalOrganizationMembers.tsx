'use client';
import {useMemo,useRef,useState} from 'react';
import {useLocalWorkspace,useWorkspacePanelState} from './LocalWorkspaceContext';
import {captureMembershipAttempt,createMembershipRepository,MembershipError,type MembershipAttempt,type OrganizationMember} from '@/lib/platform/organization-members';
import styles from './administration-controls.module.css';
const roleName=(role:string)=>role==='owner'?'Organization Super Admin':role==='admin'?'Organization Admin':'Member';
export default function LocalOrganizationMembers(){
 const {hosted,client,session,organization,authNeeded,active,requireAuth}=useLocalWorkspace()!;
 const actor=session?.user.id,org=organization?.id,ready=!!actor&&!!org&&!authNeeded;
 const repo=useMemo(()=>createMembershipRepository(client,{hosted}),[client,hosted]);
 const [open,setOpen]=useState(false),[members,setMembers]=useState<OrganizationMember[]>([]),[more,setMore]=useState(false);
 const [selected,setSelected]=useState<OrganizationMember|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState<MembershipAttempt|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),working=useRef(false),latest=useRef({actor,ready});latest.current={actor,ready};
 useWorkspacePanelState(!!selected||!!pending,busy);
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(!ready||!active||working.current)return;working.current=true;setBusy(true);const who=actor;
  try{await work(()=>latest.current.actor===who&&latest.current.ready);}catch(e){if(latest.current.actor===who){
   setMessage(e instanceof MembershipError&&e.kind==='mfa'?'Verify your identity, then retry this change.':e instanceof MembershipError&&e.kind==='conflict'?'Membership changed or the last active Super Admin is protected. Review current members before submitting again.':e instanceof MembershipError&&e.kind==='denied'?'You do not have permission to change this member’s access.':'We could not confirm the change. Retry to check the same request safely.');
   if(e instanceof MembershipError&&e.kind==='auth')requireAuth();
  }}finally{working.current=false;setBusy(false);}
 }
 async function load(current:()=>boolean,append=false){const rows=await repo.list(actor!,org!,append?members.at(-1)?.id??null:null);if(current()){setMore(rows.length>25);setMembers(old=>append?[...old,...rows.slice(0,25)]:rows.slice(0,25));}}
 async function deliver(event:string,current:()=>boolean){
  try{const state=await repo.notify(actor!,org!,event);if(current())setMessage(state==='delivered'?(hosted?'Access updated. The notification email has been sent.':'Membership change confirmed; affected-member notice delivered to the local mail sink.'):'Access updated. The notification email needs another attempt.');}
  catch{if(current())setMessage('Access updated. We couldn’t confirm the notification email. Refresh to check before retrying.');}
 }
 return <section className={styles.panel} aria-label="Organization membership management"><button hidden={open} className="btn btn-light" aria-expanded={open} disabled={!ready||busy} onClick={()=>{setOpen(v=>!v);if(!open)void run(c=>load(c));}}>{open?'Close':'Manage members'}</button>
 {open&&<div><div className={styles.heading}><h2>Team members</h2><div className={styles.headingActions}>
 <button className="btn btn-light btn-sm" disabled={!ready||busy||!!pending} onClick={()=>void run(async c=>{await load(c);if(c()&&selected){const rows=await repo.list(actor!,org!);const row=rows.find(m=>m.id===selected.id);if(row){setSelected(row);setConfirmed(false);}else{setSelected(null);setReason('');}setMessage('Member details refreshed. Review their access before confirming.');}})}>Refresh</button><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>setOpen(false)}>Close</button></div></div><p className={styles.intro}>Manage access to this organization. Suspending a member pauses their access without deleting their account or work.</p><p role="status" className={styles.feedback}>{message}</p>
 <ul className={styles.members}>{members.map(m=><li className={styles.member} key={m.id}><div className={styles.memberTop}><div className={styles.identity}><strong>{m.name}</strong><span>{roleName(m.role)}</span></div><span className={styles.status} data-status={m.status}>{m.status==='active'?'Active':m.status==='suspended'?'Suspended':'Invited'}</span>
 {m.can_manage&&<button className="btn btn-light btn-sm" disabled={!ready||busy||!!pending} onClick={()=>{setSelected(m);setReason('');setConfirmed(false);setMessage('');}}>{m.status==='active'?'Suspend access':'Restore access'}</button>}</div>

 {m.pending_notifications?.map(n=><div className={styles.notice} key={n.event_id}><span>{n.next_status==='active'?'Access restored':'Access suspended'} · Notification {n.delivery_state==='uncertain'?'not confirmed':'not sent'}</span> <button className="btn btn-light btn-sm" disabled={!ready||busy} onClick={()=>void run(async c=>{await deliver(n.event_id,c);await load(c);})}>Resend notice</button></div>)}
 </li>)}</ul>
 {!members.length&&!selected&&<p className={styles.intro}>No team members to display.</p>}{more&&<button className="btn btn-light" disabled={!ready||busy} onClick={()=>void run(c=>load(c,true))}>More members</button>}
 {(selected||pending)&&<div className={styles.review}>{selected&&<><h3>{selected.status==='active'?'Suspend access?':'Restore access?'}</h3><strong>{selected.name}</strong><fieldset className={styles.fields} disabled={!ready||busy||!!pending}>
 <p>{selected.status==='active'?'They will lose access to this organization until you restore it. Their account, work and role will be kept.':'They will regain access with their existing role and production permissions. Expired invitations will stay expired.'}</p>
 <label>Reason for this change <textarea value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
 <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I understand how this changes {selected.name}’s access.</label></fieldset></>}
 <div className={styles.actions}><button className="btn btn-pink" disabled={!ready||busy||(!pending&&(!confirmed||!reason.trim()))} onClick={()=>void run(async c=>{
  const a=pending??captureMembershipAttempt({actor:actor!,organization:org!,member:selected!.id,revision:selected!.revision,request:crypto.randomUUID(),status:selected!.status==='active'?'suspended':'active',reason,confirmed});setPending(a);
  let result;try{result=await repo.save(a);}catch(e){if(c()&&e instanceof MembershipError&&e.kind==='conflict'){setPending(null);setConfirmed(false);}throw e;}
  if(!c())return;setPending(null);setSelected(null);setReason('');setConfirmed(false);setMessage('Access updated.');
  if(result.notification_id)await deliver(result.notification_id,c);await load(c);
 })}>{pending?'Retry change':selected?.status==='active'?'Suspend access':'Restore access'}</button>
 {selected&&!pending&&<button className="btn btn-light" disabled={busy} onClick={()=>{setSelected(null);setReason('');setConfirmed(false);}}>Cancel</button>}</div></div>}
 </div>}</section>;
}
