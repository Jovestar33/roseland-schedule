'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocalWorkspace} from './LocalWorkspaceContext';
import styles from './trial-sync-review.module.css';
type Review={name:string;mappingId:string;sequence:number;reviewHash:string|null;status:string;checkedAt:string|null;resolvable:boolean;differences:{path:string;values:unknown[]}[];copies:{common:unknown;netlify:unknown;supabase:unknown}|null};
const fieldNames:Record<string,string>={desc:'Description',notes:'Notes',contactName:'Contact name',contactPhone:'Contact phone',contactEmail:'Contact email',timeIn:'Time in',dur:'Duration',town:'Town',date:'Date',action:'Action',loc:'Location'};
function label(path:string){const p=path.split('.');return p[0]==='rows'&&/^\d+$/.test(p[1])?`Row ${Number(p[1])+1} · ${fieldNames[p[2]]??p.slice(2).join('.')??'Row'}`:fieldNames[p.at(-1)!]??path??'Schedule';}
function value(v:unknown){return v===null||v===undefined?'—':typeof v==='string'?v:JSON.stringify(v,null,2);}
export default function LocalTrialSyncReview({mappingId,onBack,onResolved}:{mappingId:string;onBack:()=>void;onResolved:()=>void}){
 const {client,session,organization,active,authNeeded}=useLocalWorkspace()!;
 const [review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[take,setTake]=useState<'netlify'|'supabase'|null>(null),[confirmed,setConfirmed]=useState(false);
 const running=useRef(false),request=useRef<AbortController|null>(null),scope=useRef('');
 scope.current=`${mappingId}:${session?.user.id}:${organization?.id}:${active}:${authNeeded}`;
 useEffect(()=>()=>{request.current?.abort();},[]);
 async function load(resolve=false){
  if(running.current||!active||authNeeded||!session||!organization)return;
  if(resolve&&(!review?.resolvable||!take||!confirmed))return;
  running.current=true;setBusy(true);setMessage('');const current=scope.current,controller=new AbortController();request.current=controller;
  const valid=()=>!controller.signal.aborted&&scope.current===current;
  try{
   const fresh=await client.auth.getSession();if(fresh.error||fresh.data.session?.user.id!==session.user.id)throw Error('Sign in again to review these copies.');
   const response=await fetch('/api/trial-sync/review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${fresh.data.session.access_token}`},body:JSON.stringify(resolve?{operation:'resolve',mappingId,sequence:review!.sequence,reviewHash:review!.reviewHash,take}:{operation:'review',mappingId}),cache:'no-store',signal:controller.signal});
   const data=await response.json().catch(()=>null);
   if(!response.ok||!data)throw Error(data?.error??'The result could not be confirmed. Refresh the comparison before trying again.');
   if(!valid())return;
   if(resolve){setReview(null);setTake(null);setConfirmed(false);setMessage(data.resolved?'Both apps now have the chosen copy. Previous copies are retained in recovery history.':'This schedule still needs attention. Refresh the comparison before making another choice.');if(data.resolved)onResolved();}
   else{if(data.mappingId!==mappingId||!Array.isArray(data.differences)||typeof data.resolvable!=='boolean')throw Error('The comparison could not be verified.');setReview(data);setTake(null);setConfirmed(false);}
  }catch(error){if(valid()){setReview(null);setTake(null);setConfirmed(false);setMessage(error instanceof Error?error.message:'The comparison is unavailable. Try refreshing it.');}}
  finally{running.current=false;if(valid())setBusy(false);}
 }
 // Opening a review is read-only. Resolving always requires a separate choice and confirmation.
 useEffect(()=>{void load();return()=>{request.current?.abort();};},[mappingId]); // eslint-disable-line react-hooks/exhaustive-deps
 return <section className={styles.review} aria-label="Compare saved schedule copies">
  <div className={styles.actions}><button className="btn btn-light" onClick={onBack}>Back to synchronization</button><button className="btn btn-light" disabled={busy} onClick={()=>void load()}>Refresh comparison</button></div>
  <h3>{review?.name??'Review schedule copies'}</h3>
  {(busy||message)&&<p role="status" aria-live="polite">{busy?'Checking the saved copies…':message}</p>}
  {review&&<>
   {!review.copies?<p>This schedule has not been compared by the worker yet. No copy has been replaced.</p>:<>
    <p>Compared {review.checkedAt?new Date(review.checkedAt).toLocaleString():'at the last sync check'}. Review the differences below. Any newer edits will need another check before a copy can be replaced.</p>
    <div className={styles.tableWrap} tabIndex={0} aria-label="Differences between saved copies"><table><thead><tr><th>Changed field</th><th>Last matching copy</th><th>Legacy app</th><th>New app</th></tr></thead><tbody>{review.differences.map((d,i)=><tr key={`${d.path}:${i}`}><th scope="row">{label(d.path)}</th>{d.values.map((v,j)=><td key={j}>{value(v)}</td>)}</tr>)}</tbody></table>{!review.differences.length&&<p>No content differences in this comparison.</p>}</div>
    <details><summary>View complete saved copies</summary><div className={styles.copies}>{(['common','netlify','supabase'] as const).map((key,i)=><section key={key}><h4>{['Last matching copy','Legacy app','New app'][i]}</h4><pre>{JSON.stringify(review.copies![key],null,2)}</pre></section>)}</div></details>
    {review.resolvable?<fieldset className={styles.choice} disabled={busy}><legend>Which copy should both apps keep?</legend><p>The selected copy will replace the other one. Both previous copies will remain in recovery history. To combine edits, first update one app, then wait for a fresh comparison.</p><div className={styles.actions}>{(['netlify','supabase'] as const).map(side=><label key={side}><input type="radio" name="sync-copy" checked={take===side} onChange={()=>{setTake(side);setConfirmed(false);}}/>{side==='netlify'?'Keep the legacy copy':'Keep the new app copy'}</label>)}</div>{take&&<label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I have reviewed both copies and want to replace the {take==='netlify'?'new app':'legacy app'} copy.</label>}<div className={styles.actions}><button className="btn btn-pink" disabled={!take||!confirmed} onClick={()=>void load(true)}>Use this copy in both apps</button><button className="btn btn-light" onClick={onBack}>Cancel</button></div></fieldset>:<p>{review.status==='structure-conflict'?'This schedule was renamed, moved, archived or deleted. Review its placement before reconnecting it. No copy will be replaced here.':'No replacement is available right now. The copies may already match, or synchronization may be paused for this schedule.'}</p>}
   </>}
  </>}
 </section>;
}
