'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocalWorkspace} from './LocalWorkspaceContext';
import {readPlatformConsole,type PlatformOrganization} from '@/lib/platform/console-repository';
import {InvitationError} from '@/lib/platform/invitation-controller';
import LocalProvisioningClient from '@/app/local-workspace/LocalProvisioningClient';
import styles from './platform-console.module.css';
const statusLabels={active:'Active',pending_deletion:'Recovery window',awaiting_deletion:'Awaiting deletion',deleted:'Deleted'};
export default function PlatformConsole({onVerify}:{onVerify:()=>void}){
 const w=useLocalWorkspace()!,[tab,setTab]=useState<'organizations'|'create'>('organizations');
 const [rows,setRows]=useState<PlatformOrganization[]>([]),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[more,setMore]=useState(false);
 const [state,setState]=useState<'loading'|'ready'|'denied'|'mfa'|'error'>('loading'),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const organizationsTab=useRef<HTMLButtonElement>(null);
 const ticket=useRef(0),busyRef=useRef(false),latest=useRef(w);latest.current=w;
 async function load(append=false){
  const session=w.session;if(!session||!w.active||w.authNeeded||busyRef.current)return;
  const id=++ticket.current;busyRef.current=true;setBusy(true);if(!append)setState('loading');
  try{
   const result=await readPlatformConsole(session,'organizations',{search:query,...(append&&rows.length?{after:rows.at(-1)!.id}:{})});
   if(id!==ticket.current||latest.current.session?.access_token!==session.access_token||!latest.current.active)return;
   const page=result.organizations!;setRows(old=>append?[...old,...page.slice(0,25)]:page.slice(0,25));setMore(page.length>25);setState('ready');
  }catch(error){if(id===ticket.current){setRows([]);setMore(false);const kind=error instanceof InvitationError?error.kind:'unknown';setState(kind==='mfa'?'mfa':kind==='denied'?'denied':'error');if(kind==='auth')w.requireAuth();}}
  finally{if(id===ticket.current){busyRef.current=false;setBusy(false);}}
 }
 useEffect(()=>{
  const requests=ticket,running=busyRef;
  running.current=false;setRows([]);setMore(false);setState('loading');
  if(w.active&&!w.authNeeded&&w.session)void load();
  return()=>{requests.current++;running.current=false;};
  // Each result belongs to its exact account, token, query, and visible panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[w.active,w.authNeeded,w.session?.access_token,query,refresh]);
 const ready=state==='ready';
 return <section className={styles.console} aria-label="Platform administration">
  <header className={styles.heading}><div><span className={styles.eyebrow}>Platform Super Admin</span><h2>Platform administration</h2><p>Manage organization setup and review operational status across the platform.</p></div>{ready&&<button className="btn btn-light" disabled={busy} onClick={()=>setRefresh(x=>x+1)}>Refresh overview</button>}</header>
  {state==='loading'&&<p role="status">Checking platform access and loading organizations…</p>}
  {state==='denied'&&<div className={styles.empty}><h3>Platform access unavailable</h3><p>This console requires an active Platform Super Admin designation. Organization roles do not grant platform access.</p></div>}
  {state==='mfa'&&<div className={styles.empty}><h3>Confirm your identity</h3><p>Viewing platform organizations requires recent two-step verification. Your unfinished work is retained.</p><button className="btn btn-pink" onClick={onVerify}>Verify to continue</button></div>}
  {state==='error'&&<div className={styles.empty}><h3>Overview unavailable</h3><p>We couldn’t load the organizations. Try again.</p><button className="btn btn-light" onClick={()=>setRefresh(x=>x+1)}>Try again</button></div>}
  {ready&&<><nav className={styles.tabs} aria-label="Platform sections"><button ref={organizationsTab} aria-current={tab==='organizations'?'page':undefined} onClick={()=>setTab('organizations')}>Organizations</button><button aria-current={tab==='create'?'page':undefined} onClick={()=>setTab('create')}>New organization</button></nav>
   <div hidden={tab!=='organizations'}>
    <form className={styles.search} onSubmit={e=>{e.preventDefault();setQuery(search.trim());if(query===search.trim())setRefresh(x=>x+1);}}><label>Find an organization<input placeholder="Search by name or address" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="btn btn-light" disabled={busy}>Search</button></form>
    <p className={styles.caption}>Organization status is visible here. Opening a workspace still requires your own active membership.</p>
    {!rows.length?<div className={styles.empty}><h3>{query?'No matching organizations':'No organizations yet'}</h3><p>{query?'Try another name or organization address.':'Create an organization for an existing verified Super Admin account.'}</p></div>:<ul className={styles.organizations}>{rows.map(o=><li key={o.id}><div><h3>{o.name}</h3><p>{o.slug} · {o.timezone}</p><small>Created {new Date(o.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</small>{o.recovery_deadline&&<small>Recovery deadline {new Date(o.recovery_deadline).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</small>}</div><div className={styles.rowActions}><span className={styles.status} data-status={o.status}>{statusLabels[o.status]}</span>{o.can_open&&<button className="btn btn-light" onClick={()=>w.openOrganization(o.id)}>Open workspace</button>}</div></li>)}</ul>}
    {more&&<button className="btn btn-light" disabled={busy} onClick={()=>void load(true)}>{busy?'Loading…':'Load more organizations'}</button>}
    <aside className={styles.billing}><h3>Billing & services</h3><p>Billing is not connected in this build. Subscription, payment, and service changes are unavailable.</p></aside>
   </div>
  </>}
  <div hidden={!ready||tab!=='create'}><div className={styles.returnRow}><button className="btn btn-light" onClick={()=>{setTab('organizations');organizationsTab.current?.focus();}}>← Back</button><span>Your setup draft stays here while you review other sections.</span></div><LocalProvisioningClient/></div>
 </section>;
}
