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
 const token=useRef(''),running=useRef(false),[value,setValue]=useState<Value|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 async function load(acknowledge?:number){if(!token.current||running.current)return false;running.current=true;setBusy(true);setMessage('');setError(false);try{const r=await fetch('/api/call-sheet/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token.current,...(acknowledge?{acknowledge}:{})}),cache:'no-store'}),data=await r.json();if(!r.ok){if(r.status===403||r.status===404){setValue(null);setPrinting(false);}throw Error(data.error||'These documents are unavailable.');}setValue(data);if(data.documents==='schedule')setTab('schedule');if(data.documents==='call_sheet'||!data.documents)setTab('call_sheet');if(acknowledge)setMessage('Received—thank you. The production team can see your confirmation.');return data as Value;}catch(e){setError(true);setMessage((e as Error).message);return false;}finally{running.current=false;setBusy(false);}}
 useEffect(()=>{token.current=window.location.hash.slice(1);if(!/^[a-f0-9]{64}$/.test(token.current)){setError(true);setMessage('Open the complete document link from the production team.');return;}void load();
 // Token remains in the fragment and memory, never in a request URL or analytics event.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const selection=value?.documents??'call_sheet',normalized=value?{...value.document,meta:makeMeta(value.document.meta),rows:value.document.rows.map(makeRow)}:null;
 async function print(){const latest=await load();if(!latest)return;const data={...latest.document,meta:makeMeta(latest.document.meta),rows:latest.document.rows.map(makeRow)};if(tab==='schedule')await printSchedule(latest.name,data,async()=>!!await load(),true);else setPrinting(true);}
 return <main className="csh-recipient"><header className="csh-recipient-controls"><strong>{documentLabels[selection]}</strong><div><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>void load()}>Refresh</button>{value&&<button className="btn btn-light btn-sm" disabled={busy} onClick={()=>void print()}>Print / PDF</button>}{value?.recipient&&<button className="btn btn-pink btn-sm" disabled={busy||!!value.acknowledged} onClick={()=>void load(value.edition)}>{value.acknowledged?'Received':'Confirm received'}</button>}</div></header>{message&&<p role={error?'alert':'status'}>{message}</p>}{busy&&!value&&<p role="status">Loading documents…</p>}{selection==='both'&&<nav className="csh-document-tabs" aria-label="Documents"><button className={`btn ${tab==='schedule'?'btn-pink':'btn-light'}`} aria-pressed={tab==='schedule'} onClick={()=>setTab('schedule')}>Schedule</button><button className={`btn ${tab==='call_sheet'?'btn-pink':'btn-light'}`} aria-pressed={tab==='call_sheet'} onClick={()=>setTab('call_sheet')}>Call sheet</button></nav>}{value&&normalized&&(tab==='schedule'?<LocalEditorContext.Provider value={true}><ScheduleReadView data={normalized} name={value.name}/></LocalEditorContext.Provider>:<IssuedCallSheet value={{...value,document:normalized}}/>)}{printing&&value&&normalized&&<CallSheetPrintPreview request={{name:value.name,data:normalized,options:{contacts:value.include_contacts,details:value.full_details,edition:value.edition,issuedAt:value.created_at}}} authorize={async()=>!!await load()} onClose={()=>setPrinting(false)}/>}</main>;
}
