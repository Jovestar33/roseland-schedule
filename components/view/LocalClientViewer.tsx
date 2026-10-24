'use client';
import {useEffect,useRef,useState} from 'react';
import ScheduleReadView from './ScheduleReadView';
import {printSchedule} from '@/lib/print';
import type {ScheduleData} from '@/lib/types';
import styles from './shared-view.module.css';
export default function LocalClientViewer({legacyName,legacyToken,endpoint='/api/platform/local-client-view'}:{legacyName?:string;legacyToken?:string;endpoint?:'/api/platform/client-view'|'/api/platform/local-client-view'}){
 const [view,setView]=useState<{name:string;document:ScheduleData}|null>(null),[message,setMessage]=useState('Loading shared schedule…'),[busy,setBusy]=useState(false);
 const token=useRef(''),recipient=useRef(''),generation=useRef(0),navigation=useRef(0),working=useRef(false);
 async function refresh(){
  if(working.current)return null;working.current=true;setBusy(true);const ticket=++generation.current;
  try{
   if(token.current){
    const exchange=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token.current,...(legacyName?{legacyName}:{})}),credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!exchange.ok)throw Error('unavailable');const data=await exchange.json();if(ticket!==generation.current)return null;if(!/^[a-f0-9]{32}$/.test(data.recipient))throw Error('unavailable');recipient.current=data.recipient;
   }
   if(!/^[a-f0-9]{32}$/.test(recipient.current))throw Error('unavailable');
   const response=await fetch(`${endpoint}/${recipient.current}`,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error(response.status===428?'cookies':'unavailable');const data=await response.json();
   if(ticket===generation.current){token.current='';history.replaceState(null,'',`${window.location.pathname}?recipient=${recipient.current}`);setView(data);setMessage('');return data;}
  }catch(error){if(ticket===generation.current){setView(null);window.dispatchEvent(new Event('schedule-print-close'));setMessage(error instanceof Error&&error.message==='cookies'?(token.current?'This shared schedule needs cookies. Allow cookies for this site, then try again or reopen the original link.':'This shared session is unavailable. Reopen the original link, or ask the sender for a current link.'):'Shared schedule unavailable. Try again, or ask the sender for a current link.');}}
  finally{if(ticket===generation.current){working.current=false;setBusy(false);}}return null;
 }
 useEffect(()=>{
  const generationRef=generation,navigationRef=navigation;
  function begin(initial=false){
   navigationRef.current++;window.dispatchEvent(new Event('schedule-print-close'));
   generationRef.current++;working.current=false;setView(null);setMessage('Loading shared schedule…');
   token.current=(initial?legacyToken:undefined)||window.location.hash.slice(1);recipient.current=token.current?'':new URLSearchParams(window.location.search).get('recipient')??'';
   history.replaceState(null,'',window.location.pathname+(recipient.current&&/^[a-f0-9]{32}$/.test(recipient.current)?`?recipient=${recipient.current}`:''));void refresh();
  }
  begin(true);const timer=setInterval(()=>void refresh(),30000),focus=()=>void refresh(),navigate=()=>begin();
  window.addEventListener('focus',focus);window.addEventListener('hashchange',navigate);window.addEventListener('popstate',navigate);
  return()=>{navigationRef.current++;window.dispatchEvent(new Event('schedule-print-close'));generationRef.current++;working.current=false;clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('hashchange',navigate);window.removeEventListener('popstate',navigate);};
 // Pending exchange material lives in memory only; confirmed reads use an HttpOnly cookie.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[legacyName,legacyToken,endpoint]);
 return <main>{view?<><div className={`readonly-bar ${styles.bar}`}><span>Read-only schedule</span><button className="btn btn-light btn-sm" disabled={busy} onClick={async()=>{const ticket=navigation.current;const current=await refresh();if(!current||ticket!==navigation.current)return;const expectedRecipient=recipient.current;const sameRecipient=()=>ticket===navigation.current&&recipient.current===expectedRecipient;await printSchedule(current.name,current.document,async()=>{if(!sameRecipient())return false;const refreshed=await refresh();return !!refreshed&&sameRecipient();});}}>Print / Save PDF</button></div><ScheduleReadView data={view.document} name={view.name}/></>:<section className={styles.state}><h1>{busy?'Opening shared schedule…':'Schedule unavailable'}</h1><p role="status">{message}</p><button className="btn btn-light" disabled={busy} onClick={()=>void refresh()}>{busy?'Checking…':'Try again'}</button></section>}</main>;
}
