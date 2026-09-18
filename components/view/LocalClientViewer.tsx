'use client';
import {useEffect,useRef,useState} from 'react';
import ScheduleReadView from './ScheduleReadView';
import {printSchedule} from '@/lib/print';
import type {ScheduleData} from '@/lib/types';
export default function LocalClientViewer({legacyName,legacyToken}:{legacyName?:string;legacyToken?:string}){
 const [view,setView]=useState<{name:string;document:ScheduleData}|null>(null),[message,setMessage]=useState('Loading shared schedule…');
 const token=useRef(''),generation=useRef(0);
 async function refresh(){const ticket=++generation.current;try{const response=await fetch('/api/platform/local-client-view',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:token.current,...(legacyName!==undefined?{legacyName}:{})}),cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error();const data=await response.json();if(ticket===generation.current){setView(data);setMessage('');return data;}}catch{if(ticket===generation.current){setView(null);setMessage('Shared schedule unavailable. Ask the sender for a current link.');}}return null;}
 useEffect(()=>{const generationRef=generation;token.current=legacyToken??window.location.hash.slice(1);history.replaceState(null,'',window.location.pathname);void refresh();const timer=setInterval(()=>void refresh(),30000),focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{generationRef.current++;clearInterval(timer);window.removeEventListener('focus',focus);};
 // The bearer stays in component memory, outside URLs after initial navigation.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[legacyName,legacyToken]);
 return <main>{view?<><div className="readonly-bar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 24px"}}><span>Read-only Client schedule</span><button className="btn btn-light btn-sm" onClick={async()=>{const current=await refresh();if(current)await printSchedule(current.name);}}>Print / Save PDF</button></div><ScheduleReadView data={view.document} name={view.name}/></>:<p role="status">{message}</p>}</main>;
}
