'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {captureClientLink,ClientLinkVersionError,createClientLinksRepository,type ClientLink,type ClientLinkAttempt,type LinkReview} from '@/lib/platform/client-links';
import styles from './schedule-sharing.module.css';

type Props={expanded?:boolean;workspacePath?:'/review'|'/local-workspace'|'/workspace';client:SupabaseClient;actor:string|null;organization:string;schedule:string;name?:string;enabled:boolean;readOnly:boolean;onInvite?:()=>void;onState?:(dirty:boolean,busy:boolean)=>void};
const date=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const expired=(link:ClientLink)=>!!link.expires_at&&Date.parse(link.expires_at)<=Date.now();
export default function LocalScheduleSharing({expanded=false,workspacePath='/local-workspace',client,actor,organization,schedule,name,enabled,readOnly,onInvite,onState}:Props){
 const repository=useMemo(()=>createClientLinksRepository(client),[client]);
 const [more,setMore]=useState(false);
 const [review,setReview]=useState<LinkReview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [origin,setOrigin]=useState(''),[issued,setIssued]=useState<{id:string;url:string;expires:string}|null>(null);
 const [confirm,setConfirm]=useState<ClientLink|null>(null),[creating,setCreating]=useState(false),[pending,setPending]=useState<ClientLinkAttempt|null>(null);
 const createTrigger=useRef<HTMLButtonElement|null>(null),revokeTrigger=useRef<HTMLButtonElement|null>(null);
 const priorConfirmation=useRef({creating:false,confirm:false});
 useEffect(()=>{const previous=priorConfirmation.current;if(previous.creating&&!creating)createTrigger.current?.focus();if(previous.confirm&&!confirm)revokeTrigger.current?.focus();priorConfirmation.current={creating,confirm:!!confirm};},[creating,confirm]);
 const working=useRef(false),mounted=useRef(true),current=useRef({actor,organization,schedule,enabled});current.current={actor,organization,schedule,enabled};
 useEffect(()=>{mounted.current=true;setOrigin(window.location.origin);return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onState?.(!!pending,busy);},[pending,busy,onState]);
 function same(){const now=current.current;return mounted.current&&now.actor===actor&&now.organization===organization&&now.schedule===schedule&&now.enabled;}
 async function run(work:()=>Promise<void>){
  if(!actor||!enabled||working.current)return;working.current=true;setBusy(true);setError('');setMessage('');
  try{await work();}catch(e){if(same()){if(e instanceof ClientLinkVersionError){setPending(null);setCreating(false);}setError(e instanceof Error?e.message:'Sharing is unavailable. Please try again.');}}
  finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 async function load(append=false){
  if(!actor)return;const data=await repository.read(actor,schedule,append?review?.links.at(-1)?.id??null:null);
  if(same()){
   setMore(data.links.length===100);
   setReview(append?{...data,links:[...(review?.links??[]),...data.links]}:data);
   setIssued(previous=>{const item=data.links.find(link=>link.id===previous?.id);return item&&(item.revoked_at||expired(item))?null:previous;});
  }
 }
 useEffect(()=>{if(expanded&&enabled)void run(()=>load());
 // Reopening refreshes permissions while preserving an unconfirmed creation request.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[expanded,enabled]);
 async function create(){
  if(!actor||!review||readOnly||!review.can_create)return;
  const attempt=pending??await captureClientLink(actor,schedule,review.version);if(!same())return;setPending(attempt);
  const receipt=await repository.create(attempt);if(!same())return;
  setPending(null);setCreating(false);
  if(receipt.revoked){setIssued(null);setMessage('That link has already been revoked. You can create a new one.');}
  else{setIssued({id:receipt.id,url:`${window.location.origin}${workspacePath==='/workspace'?'/client':'/local-client'}#${attempt.token}`,expires:receipt.expires_at});setMessage('Read-only link created. Copy it below.');}
  await load();
 }
 async function copy(value:string,label:string){
  if(!enabled||!value)return;
  try{await navigator.clipboard.writeText(value);if(same()){setError('');setMessage(`${label} copied.`);}}
  catch{if(same()){setError('');setMessage('Select the link in its field and copy it manually.');}}
 }
 const teamUrl=origin?`${origin}${workspacePath}?screen=schedule&org=${organization}&schedule=${schedule}`:'';
 const available=review?.links.filter(link=>link.kind==='client'&&!link.revoked_at&&!expired(link))??[];
 const inactive=review?.links.filter(link=>link.kind==='client'&&(!!link.revoked_at||expired(link)))??[];
 const imported=review?.links.filter(link=>link.kind==='legacy')??[];
 const validIssued=issued&&Date.parse(issued.expires)>Date.now()?issued:null;
 function linkRow(link:ClientLink){return <li key={link.id} className={styles.linkRow}>
  <div><strong>{link.kind==='legacy'?'Imported sharing access':`Read-only link · ${date(link.created_at)}`}</strong>
   <span>{link.revoked_at?`Revoked ${date(link.revoked_at)}`:link.expires_at?`${expired(link)?'Expired':'Expires'} ${date(link.expires_at)}`:'Each original link keeps its expiry date.'}</span>
   {link.kind==='legacy'&&<small>Applies to this app only; Netlify links are separate.</small>}
  </div>
  <div className={styles.rowActions}><span className={styles.badge}>{link.revoked_at?'Revoked':expired(link)?'Expired':link.kind==='legacy'?'Imported':'Active'}</span>
   {link.can_revoke&&!link.revoked_at&&!expired(link)&&<button type="button" className="btn btn-light btn-sm" disabled={busy||readOnly||!enabled||!!pending} hidden={confirm?.id===link.id} aria-label={link.kind==='legacy'?'Revoke imported sharing access':`Revoke read-only link created ${date(link.created_at)}`} onClick={event=>{revokeTrigger.current=event.currentTarget;setConfirm(link);setCreating(false);}}>Revoke</button>}</div>
 </li>;}
 return <details className={styles.sharing} open={expanded?true:undefined} onToggle={e=>{if(!expanded&&e.currentTarget.open&&!review)void run(()=>load());}}>
  <summary hidden={expanded}>Share schedule</summary>
  {name&&<p className={styles.scheduleName}>{name}</p>}
  {message&&<p className={styles.feedback} role="status">{message}</p>}
  {error&&<p className={styles.feedback} role="alert">{error}</p>}
  <section className={styles.section} aria-label="Team access">
   <div className={styles.sectionHeading}><h3>Team access</h3><span className={styles.badge}>Sign-in required</span></div>
   <p>Share this schedule with teammates who already have access.</p>
   <label className={styles.linkField}>Schedule link<div className={styles.copyRow}><input aria-label="Schedule link" readOnly value={teamUrl} onFocus={e=>e.target.select()}/><button type="button" className="btn btn-light btn-sm" aria-label="Copy schedule link" disabled={!enabled||!teamUrl} onClick={()=>void copy(teamUrl,'Schedule link')}>Copy link</button></div></label>
   <p className={styles.hint}>This link doesn’t grant access. New teammates need an invitation and access to this production.</p>
   {onInvite?<button type="button" className="btn btn-light btn-sm" disabled={!enabled||readOnly||busy||!!pending} onClick={onInvite}>Invite people</button>:<p className={styles.hint}>An organization admin can invite people and manage access.</p>}
  </section>
  <section className={styles.section} aria-label="Read-only viewing">
   <div className={styles.sectionHeading}><h3>Read-only viewing</h3><span className={styles.badge}>No sign-in</span></div>
   <p>Anyone with a read-only link can view and print the latest saved schedule. They cannot edit it. New links expire after 30 days.</p>
   <details className={styles.disclosure}><summary>What viewers can see</summary><p>Schedule details, times, locations, weather and row notes. Contacts, call sheets, status and version history are excluded. Unsaved edits aren’t shared.</p></details>
   {validIssued&&<div className={styles.created}><label className={styles.linkField}>New read-only link<div className={styles.copyRow}><input aria-label="New read-only link" readOnly value={validIssued.url} onFocus={e=>e.target.select()}/><button type="button" className="btn btn-pink btn-sm" aria-label="Copy read-only link" disabled={!enabled} onClick={()=>void copy(validIssued.url,'Read-only link')}>Copy link</button></div></label><p className={styles.hint}>Expires {date(validIssued.expires)}. Copy this link before leaving or reloading; it can’t be retrieved later.</p></div>}
   <div className={styles.actions} hidden={creating||!!confirm}>
    {review?.can_create&&!readOnly&&<button type="button" ref={createTrigger} className="btn btn-pink btn-sm" disabled={!enabled||busy} onClick={()=>{setConfirm(null);setCreating(true);}}>{pending?'Retry read-only link':available.length?'Create another read-only link':'Create read-only link'}</button>}
    <button type="button" className="btn btn-light btn-sm" disabled={!enabled||busy} onClick={()=>void run(()=>load())}>{busy?'Checking…':'Refresh'}</button>
   </div>
   {!review&&!error&&<p role="status">{busy?'Loading read-only links…':'Open sharing to load read-only links.'}</p>}
   {review&&(!review.can_create||readOnly)&&<p className={styles.hint}>{readOnly?'This organization is read-only.':'Your current permissions allow viewing links, but not creating them.'}</p>}
   {pending&&<p className={styles.hint}>The previous request hasn’t been confirmed. Retry it to retrieve the same link.</p>}
   {creating&&<div className={styles.confirmation} role="group" aria-label="Create read-only link"><h4>{pending?'Finish creating this link?':'Create a read-only link?'}</h4><p>{pending?'Retrying uses the same request and won’t create a duplicate.':'Anyone you send it to can forward it. You can revoke access here at any time.'}</p><div className={styles.actions}><button type="button" className="btn btn-pink btn-sm" disabled={!enabled||busy||readOnly||!review?.can_create} onClick={()=>void run(create)}>{pending?'Retry same link':'Create link'}</button><button type="button" className="btn btn-light btn-sm" disabled={busy} onClick={()=>{setCreating(false);}}>{pending?'Not now':'Cancel'}</button></div></div>}
   {confirm&&<div className={styles.confirmation} role="group" aria-label="Revoke read-only link"><h4>{confirm.kind==='legacy'?'Revoke imported sharing access?':'Revoke this read-only link?'}</h4><p>{confirm.kind==='legacy'?'This disables the imported sharing access in this app. It does not revoke links on Netlify.':'Anyone using this link will lose access.'}</p><div className={styles.actions}><button type="button" className="btn btn-light btn-sm" disabled={busy||readOnly||!enabled} onClick={()=>void run(async()=>{await repository.revoke(actor!,schedule,confirm);if(same()){setConfirm(null);setIssued(previous=>previous?.id===confirm.id?null:previous);setMessage('Link revoked. It can no longer open this schedule.');await load();}})}>Revoke link</button><button type="button" className="btn btn-light btn-sm" disabled={busy} onClick={()=>{setConfirm(null);}}>Cancel</button></div></div>}
   {review&&<div className={styles.inventory}><h4>Available links{available.length?` (${available.length})`:''}</h4>{available.length?<><ul className={styles.links}>{[...available].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(linkRow)}</ul><p className={styles.hint}>Previously created URLs aren’t stored. If you no longer have a link, create a new one.</p></>:<p className={styles.empty}>No active read-only links.</p>}
    {!!inactive.length&&<details className={styles.disclosure}><summary>Expired &amp; revoked ({inactive.length})</summary><ul className={styles.links}>{[...inactive].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(linkRow)}</ul></details>}
    {!!imported.length&&<details className={styles.disclosure}><summary>Imported sharing ({imported.length})</summary><p className={styles.hint}>These records came from the legacy app. During the trial, Netlify links are managed separately from links created here.</p><ul className={styles.links}>{imported.map(linkRow)}</ul></details>}
   </div>}
   {more&&<button type="button" className="btn btn-light btn-sm" disabled={busy||!enabled} onClick={()=>void run(()=>load(true))}>Load more links</button>}
  </section>
 </details>;
}
