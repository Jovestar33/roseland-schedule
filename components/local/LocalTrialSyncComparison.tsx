'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocalWorkspace} from './LocalWorkspaceContext';
import styles from './trial-sync-review.module.css';
type Row={id:string;name:string;state:'matching'|'different'|'changed-during-check'|'unavailable';checkedAt?:string};
type Inventory={legacyUnmapped:string[];legacyMissing:string[];targetUnmapped:{id:string;name:string}[];targetMissing:string[]};
const labels={matching:'Contents match',different:'Contents differ','changed-during-check':'Edited during comparison',unavailable:'Could not compare'};
export default function LocalTrialSyncComparison(){
 const {client,session,organization,active,authNeeded}=useLocalWorkspace()!;
 const [rows,setRows]=useState<Row[]>([]),[inventory,setInventory]=useState<Inventory|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false);
 const controller=useRef<AbortController|null>(null),scope=useRef('');scope.current=`${session?.user.id}:${organization?.id}:${active}:${authNeeded}`;
 useEffect(()=>()=>{controller.current?.abort();},[session?.user.id,organization?.id,active,authNeeded]);
 async function compare(){
  if(controller.current||!active||authNeeded||!session||!organization)return;
  const run=new AbortController();controller.current=run;const identity=scope.current;
  const current=()=>!run.signal.aborted&&scope.current===identity;
  setBusy(true);setComplete(false);setRows([]);setInventory(null);setMessage('Comparing saved copies…');
  try{
   let offset:number|null=0,mappingsHash:string|undefined;const collected:Row[]=[];
   do{
    const fresh=await client.auth.getSession();if(fresh.error||fresh.data.session?.user.id!==session.user.id)throw Error('Sign in again to compare schedules.');
    if(!current())return;
    const response:Response=await fetch('/api/trial-sync/preview',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${fresh.data.session.access_token}`},body:JSON.stringify({organizationId:organization.id,offset,mappingsHash}),signal:run.signal,cache:'no-store'}).catch(()=>{throw Error('The comparison service could not be reached. No schedules were changed.');});
    const result:{mode:string;rows:Row[];total:number;mappingsHash:string;nextOffset:number|null;inventory:Inventory;error?:string}=await response.json().catch(()=>{throw Error('The comparison service is unavailable. No schedules were changed.');});if(!current())return;
    if(!response.ok)throw Error(typeof result.error==='string'?result.error:'The comparison could not finish.');
    if(result.mode!=='read-only'||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||result.total<0||result.total>10000||typeof result.mappingsHash!=='string'||(mappingsHash&&mappingsHash!==result.mappingsHash)||result.rows.some((r:Row)=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!Object.hasOwn(labels,r.state)||collected.some(c=>c.id===r.id))||(result.nextOffset!==null&&result.nextOffset!==offset+result.rows.length)||result.rows.length>3||(!result.rows.length&&result.nextOffset!==null))throw Error('The comparison response could not be verified.');
    if(!result.inventory||!['legacyUnmapped','legacyMissing','targetMissing'].every(k=>Array.isArray(result.inventory[k as keyof Inventory])&&(result.inventory[k as keyof Inventory] as unknown[]).every(x=>typeof x==='string'))||!Array.isArray(result.inventory.targetUnmapped)||result.inventory.targetUnmapped.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'))throw Error('The library comparison could not be verified.');
    collected.push(...result.rows);mappingsHash=result.mappingsHash;offset=result.nextOffset;
    setRows([...collected]);setInventory(result.inventory);setMessage(`Compared ${collected.length} of ${result.total} schedules…`);
    if(offset===null&&collected.length!==result.total)throw Error('Some schedules were not compared. Try again.');
   }while(offset!==null);
   if(current()){setComplete(true);setMessage(`Comparison complete: ${collected.length} schedules checked. No schedules were changed.`);}
  }catch(error){if(current())setMessage(error instanceof Error?error.message:'The comparison could not finish. No schedules were changed.');}
  finally{if(controller.current===run){controller.current=null;if(scope.current===identity)setBusy(false);}}
 }
 const attention=rows.filter(r=>r.state!=='matching');
 const inventoryCount=inventory?inventory.legacyUnmapped.length+inventory.legacyMissing.length+inventory.targetUnmapped.length+inventory.targetMissing.length:0;
 return <section className={styles.comparison} aria-label="Compare saved copies">
  <h3>Compare saved copies</h3>
  <p>Compare the saved contents in both apps. This check does not copy or change any schedules.</p>
  <div className={styles.actions}><button className="btn btn-pink" disabled={busy} onClick={()=>void compare()}>{busy?'Comparing…':'Compare copies'}</button>{busy&&<button className="btn btn-light" onClick={()=>{controller.current?.abort();setBusy(false);setComplete(false);setMessage('Comparison stopped. No schedules were changed.');}}>Cancel comparison</button>}</div>
  {message&&<p className={styles.notice} role="status">{message}</p>}
  {rows.length>0&&<p>{rows.filter(r=>r.state==='matching').length} match · {attention.length} need attention{!complete?' · Partial results':''}</p>}
  {attention.length>0&&<ul>{attention.map(r=><li key={r.id}><strong>{r.name}</strong>: {labels[r.state]}</li>)}</ul>}
  {!!inventoryCount&&<details><summary>{inventoryCount} library differences</summary><ul>{inventory!.legacyUnmapped.map(k=><li key={'lu'+k}>Legacy app, not connected: {k}</li>)}{inventory!.legacyMissing.map(k=><li key={'lm'+k}>Legacy app, missing: {k}</li>)}{inventory!.targetUnmapped.map(r=><li key={r.id}>New app, not connected: {r.name}</li>)}{inventory!.targetMissing.map(k=><li key={'tm'+k}>New app, missing: {k}</li>)}</ul></details>}
  {complete&&<p>This compares schedule contents at the times checked. It does not confirm ongoing synchronization, library placement, templates or other settings.</p>}
 </section>;
}
