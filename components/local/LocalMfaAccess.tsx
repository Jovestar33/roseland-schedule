'use client';
/* eslint-disable @next/next/no-img-element -- Auth supplies a private in-memory QR data URL, never an optimized remote asset. */
import {useEffect,useRef,useState} from 'react';
import type {Session,SupabaseClient} from '@supabase/supabase-js';

export type MfaAccessStage='checking'|'unavailable'|'enroll'|'code'|'ready';
type Props={review?:boolean;managedRecovery?:boolean;focusActive?:boolean;onStageChange?(stage:MfaAccessStage):void;client:SupabaseClient;session:Session|null;authNeeded:boolean;organization:string|null;revision:number;recentRequired:boolean;onReady(ready:boolean):void;onVerified():void};
// Secrets live only in this account-scoped component; no factor removal is exposed.
export default function LocalMfaAccess({review=false,managedRecovery=false,focusActive=true,onStageChange,client,session,authNeeded,organization,revision,recentRequired,onReady,onVerified}:Props){
 const [stage,setStage]=useState<MfaAccessStage>('checking');
 const [factor,setFactor]=useState(''),[secret,setSecret]=useState(''),[qr,setQr]=useState(''),[code,setCode]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[retry,setRetry]=useState(0);
 const ticket=useRef(0),working=useRef(false),latest=useRef(session);latest.current=session;
 const checked=useRef(''),pendingFactor=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{onStageChange?.(stage);},[stage,onStageChange]);
 useEffect(()=>{if(focusActive&&(stage==='code'||stage==='enroll'))heading.current?.focus();},[stage,focusActive]);
 const actor=session?.user.id,token=session?.access_token;
 useEffect(()=>{pendingFactor.current=false;setFactor('');setSecret('');setQr('');setCode('');setOpen(false);setMessage('');},[actor]);
 useEffect(()=>{
  const requests=ticket;const seq=++requests.current;const context=[token,organization,authNeeded,recentRequired].join(':');
  if(checked.current!==context){checked.current=context;onReady(false);setStage('checking');setMessage('');}
  if(!token||authNeeded)return;
  setStage(previous=>previous==='unavailable'?'checking':previous);
  void Promise.all([client.rpc('get_my_mfa_status').setHeader('Authorization',`Bearer ${token}`),
   client.rpc('list_my_organization_access',{target_organization_id:organization}).setHeader('Authorization',`Bearer ${token}`),client.auth.mfa.listFactors()]).then(([status,orgs,factors])=>{
   if(seq!==ticket.current)return;
   if(status.error||orgs.error||factors.error)throw Error('MFA status unavailable');
   setMessage(previous=>previous==='Access checks are temporarily unavailable. Try again to continue.'?'':previous);
   const required=pendingFactor.current||status.data.required||orgs.data.some((o:{id:string;mfa_required:boolean})=>o.id===organization&&o.mfa_required)||recentRequired;
   const verified=factors.data.totp.find(f=>f.status==='verified');
   if(verified)setFactor(verified.id);
   const ready=(!required||status.data.aal==='aal2')&&!recentRequired&&!pendingFactor.current;
   setStage(ready?'ready':verified||pendingFactor.current?'code':'enroll');onReady(ready);
   if(!ready)setOpen(true);
  }).catch(()=>{if(seq===ticket.current){setStage('unavailable');onReady(false);setMessage('Access checks are temporarily unavailable. Try again to continue.');}});
  return()=>{requests.current++;};
 },[token,authNeeded,organization,revision,retry,recentRequired,client,onReady]);
 async function run(action:(current:()=>boolean)=>Promise<void>){
  if(working.current||!actor)return;working.current=true;setBusy(true);const expected=actor;
  try{await action(()=>latest.current?.user.id===expected);}catch{if(latest.current?.user.id===expected)setMessage('Verification could not finish. Retry the current step; your work is retained.');}
  finally{working.current=false;setBusy(false);}
 }
 if(!session||authNeeded)return null;
 if(stage==='checking'||stage==='unavailable')return managedRecovery?null:<section aria-label="Access checks"><h2>{stage==='checking'?'Checking your access…':'Unable to check your access'}</h2><p role="status">{stage==='checking'?'Checking your organization and account security.':message}</p><p>Your open drafts and pending requests are retained.</p>{stage==='unavailable'&&<button onClick={()=>setRetry(v=>v+1)}>Try again</button>}</section>;
 return <section aria-label="Account security" style={{margin:'12px 0',maxWidth:720}}>
  {stage==='ready'&&<button onClick={()=>setOpen(v=>!v)} disabled={busy}>{review?'Two-step verification':'Account security'}</button>}
  {(open||stage!=='ready')&&<div>
   <h2 ref={heading} tabIndex={-1}>{stage==='ready'?(review?'Two-step verification':'Account security'):stage==='enroll'?'Set up two-step verification':'Verify your authenticator'}</h2>
   <p>{stage==='ready'?'An authenticator adds protection to your account.':stage==='enroll'?'Your access requires an authenticator. Set one up to continue.':'Enter the current six-digit code from your authenticator to continue.'}</p>
   <p role="status">{message}</p>
   {stage==='ready'&&<p>{factor?'Authenticator verified for this session.':'MFA is optional for your current access.'}</p>}
   {(stage==='enroll'||stage==='ready'&&!factor)&&!secret&&<button disabled={busy} onClick={()=>void run(async current=>{
    const result=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Roseland '+crypto.randomUUID().slice(0,8)});
    if(!current())return;
    if(result.error||!result.data){setMessage('Enrollment could not start. Retry when connected. Existing authenticators are unchanged.');return;}
    pendingFactor.current=true;setFactor(result.data.id);setSecret(result.data.totp.secret);setQr(result.data.totp.qr_code);setStage('code');onReady(false);setMessage('Scan the code, then enter the six-digit code from your authenticator.');
   })}>Set up authenticator</button>}
   {secret&&<div><img src={qr} alt="Authenticator setup QR code" width={200} height={200}/><p>Manual setup secret: <code>{secret}</code></p></div>}
   {stage==='code'&&<form onSubmit={e=>{e.preventDefault();void run(async current=>{
    const result=await client.auth.mfa.challengeAndVerify({factorId:factor,code});
    if(!current())return;setCode('');
    if(result.error){setMessage('That code was not accepted. Try the current code from your authenticator.');return;}
    pendingFactor.current=false;setSecret('');setQr('');setMessage('Authenticator verified. Your retained work is ready to resume.');onVerified();setRetry(v=>v+1);
   });}}><label>Authenticator code <input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>Verify authenticator</button></form>}
   {stage!=='ready'&&<p>Your open drafts and pending requests are retained.</p>}
   {stage==='code'&&!secret&&<details><summary>Can’t use your authenticator?</summary><p>Authenticator reset is not available here. Contact your organization’s administrator for help.</p></details>}
  </div>}
 </section>;
}
