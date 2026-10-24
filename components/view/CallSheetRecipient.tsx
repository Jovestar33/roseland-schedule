'use client';
import {useEffect,useRef,useState} from 'react';
import CallSheetPrintPreview from '@/components/print/CallSheetPrintPreview';
import {IssuedCallSheet,type IssuedCallSheetData} from '@/components/modals/CallSheetModal';
export default function CallSheetRecipient(){
 const [printing,setPrinting]=useState(false);
 const token=useRef(''),[value,setValue]=useState<IssuedCallSheetData|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 async function load(acknowledge?:number){if(!token.current||busy)return;setBusy(true);setMessage('');setError(false);try{const r=await fetch('/api/call-sheet/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token.current,...(acknowledge?{acknowledge}:{})}),cache:'no-store'}),data=await r.json();if(!r.ok){if(r.status===403||r.status===404){setValue(null);setPrinting(false);}throw Error(data.error||'The call sheet is unavailable.');}setValue(data);if(acknowledge)setMessage('Received—thank you. The production team can see your confirmation.');}catch(e){setError(true);setMessage((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{token.current=window.location.hash.slice(1);if(!/^[a-f0-9]{64}$/.test(token.current)){setError(true);setMessage('Open the complete call-sheet link from the production team.');return;}void load();
 // The token stays in memory and the fragment, never a request URL or analytics event.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <main className="csh-recipient"><header className="csh-recipient-controls"><strong>Call sheet</strong><div><button className="btn btn-light btn-sm" disabled={busy} onClick={()=>void load()}>Refresh</button>{value&&<button className="btn btn-light btn-sm" onClick={()=>setPrinting(true)}>Print / PDF</button>}{value?.recipient&&<button className="btn btn-pink btn-sm" disabled={busy||!!value.acknowledged} onClick={()=>void load(value.edition)}>{value.acknowledged?'Received':'Confirm received'}</button>}</div></header>{message&&<p role={error?'alert':'status'}>{message}</p>}{busy&&!value&&<p role="status">Loading call sheet…</p>}{value&&<IssuedCallSheet value={value}/>}{printing&&value&&<CallSheetPrintPreview request={{name:value.name,data:value.document,options:{contacts:value.include_contacts,details:value.full_details,edition:value.edition,issuedAt:value.created_at}}} onClose={()=>setPrinting(false)}/>}</main>;
}
