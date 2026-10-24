'use client';
import {useEffect,useRef,useState} from 'react';
import CallSheetPrintPreview from '@/components/print/CallSheetPrintPreview';
import {IssuedCallSheet,type IssuedCallSheetData} from '@/components/modals/CallSheetModal';
import ScheduleReadView from './ScheduleReadView';
import {LocalEditorContext} from '@/components/schedule/LocalEditorContext';
import {makeMeta,makeRow} from '@/lib/rowNormalizer';
import {printSchedule} from '@/lib/print';
import {documentLabels,type DocumentSelection} from '@/lib/platform/document-email';
type Value=IssuedCallSheetData&{documents?:DocumentSelection};
export default function CallSheetRecipient(){
 const [printing,setPrinting]=useState(false),[tab,setTab]=useState<'schedule'|'call_sheet'>('call_sheet');
 const token=useRef(''),running=useRef(false),generation=useRef(0),[value,setValue]=useState<Value|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 async function load(acknowledge?:number){
  if(!token.current||running.current)return false;
  const ticket=generation.current;
  running.current=true;setBusy(true);setMessage('');setError(false);
  try{
   const r=await fetch('/api/call-sheet/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token.current,...(acknowledge?{acknowledge}:{})}),cache:'no-store'}),data=await r.json();
   if(ticket!==generation.current)return false;
   if(!r.ok){if(r.status===403||r.status===404){setValue(null);setPrinting(false);window.dispatchEvent(new Event('schedule-print-close'));}throw Error(data.error||'These documents are unavailable.');}
   setValue(data);if(data.documents==='schedule')setTab('schedule');if(data.documents==='call_sheet'||!data.documents)setTab('call_sheet');if(acknowledge)setMessage('Received—thank you. The production team can see your confirmation.');return data as Value;
  }catch(e){if(ticket===generation.current){setError(true);setMessage((e as Error).message);}return false;}
  finally{if(ticket===generation.current){running.current=false;setBusy(false);}}
 }
 useEffect(()=>{
  const requests=generation;
  function begin(){
   window.dispatchEvent(new Event('schedule-print-close'));
   requests.current++;running.current=false;setValue(null);setPrinting(false);setBusy(false);setMessage('');setError(false);
   token.current=window.location.hash.slice(1);
   if(!/^[a-f0-9]{64}$/.test(token.current)){token.current='';setError(true);setMessage('This link is incomplete. Open the full link from your email.');return;}
   void load();
  }
  begin();window.addEventListener('hashchange',begin);
  return()=>{requests.current++;running.current=false;window.dispatchEvent(new Event('schedule-print-close'));window.removeEventListener('hashchange',begin);};
 // Token remains in the fragment and memory, never in a request URL or analytics event.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const selection=value?.documents??'call_sheet',normalized=value?{...value.document,meta:makeMeta(value.document.meta),rows:value.document.rows.map(makeRow)}:null;
 async function print(){
  const ticket=generation.current,expectedToken=token.current;
  const current=()=>ticket===generation.current&&token.current===expectedToken;
  const latest=await load();if(!latest||!current())return;
  const data={...latest.document,meta:makeMeta(latest.document.meta),rows:latest.document.rows.map(makeRow)};
  if(tab==='schedule')await printSchedule(latest.name,data,async()=>{if(!current())return false;const refreshed=await load();return !!refreshed&&current();},true);
  else setPrinting(true);
 }
 return <main className="csh-recipient"><header className="csh-recipient-controls"><strong>{documentLabels[selection]}</strong><div><button className="btn btn-light btn-sm" disabled={busy||!token.current} onClick={()=>void load()}>Refresh</button>{value&&<button className="btn btn-light btn-sm" disabled={busy} onClick={()=>void print()}>Print / PDF</button>}{value?.recipient&&<button className="btn btn-pink btn-sm" disabled={busy||!!value.acknowledged} onClick={()=>void load(value.edition)}>{value.acknowledged?'Received':'Confirm received'}</button>}</div></header>{message&&<section className={!value&&error?'csh-recipient-empty':'csh-recipient-message'} role={error?'alert':'status'}>{!value&&error&&<h1>Documents unavailable</h1>}<p>{message}</p>{!value&&error&&<p>Ask the production team for a current link if you still cannot open these documents.</p>}</section>}{busy&&!value&&<p role="status">Loading documents…</p>}{selection==='both'&&<nav className="csh-document-tabs" aria-label="Documents"><button className={`btn ${tab==='schedule'?'btn-pink':'btn-light'}`} aria-pressed={tab==='schedule'} onClick={()=>setTab('schedule')}>Schedule</button><button className={`btn ${tab==='call_sheet'?'btn-pink':'btn-light'}`} aria-pressed={tab==='call_sheet'} onClick={()=>setTab('call_sheet')}>Call sheet</button></nav>}{value&&normalized&&(tab==='schedule'?<LocalEditorContext.Provider value={true}><ScheduleReadView data={normalized} name={value.name}/></LocalEditorContext.Provider>:<IssuedCallSheet value={{...value,document:normalized}}/>)}{printing&&value&&normalized&&<CallSheetPrintPreview request={{name:value.name,data:normalized,options:{contacts:value.include_contacts,details:value.full_details,edition:value.edition,issuedAt:value.created_at}}} authorize={async()=>!!await load()} onClose={()=>setPrinting(false)}/>}</main>;
}
