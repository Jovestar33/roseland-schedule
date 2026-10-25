'use client';
import {useContext,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ModalVisibilityContext} from '@/components/modals/Modal';
import type {ScheduleData} from '@/lib/types';
import {useCmsStore} from '@/lib/store/cmsStore';
import {organizationLogo} from '@/lib/branding';
import {layoutCallSheetPrint,renderCallSheetPrint,type CallSheetPrintOptions} from '@/lib/call-sheet-print';
import styles from './schedule-print.module.css';
export interface CallSheetPrintRequest {data:ScheduleData;name:string;options:CallSheetPrintOptions}
export default function CallSheetPrintPreview({request,onClose,authorize}:{request:CallSheetPrintRequest;onClose:()=>void;authorize?:()=>Promise<boolean>}){
 const visible=useContext(ModalVisibilityContext);
 const logo=useCmsStore(s=>organizationLogo(s.config,'light'));
 const [paper,setPaper]=useState<'letter'|'a4'>('letter'),[html,setHtml]=useState(''),[pages,setPages]=useState(0),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[previewKey,setPreviewKey]=useState(0);
 const frame=useRef<HTMLIFrameElement>(null),close=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const generation=useRef(0),printing=useRef(false),mounted=useRef(true),latest=useRef({request,visible,previewKey});latest.current={request,visible,previewKey};
 function invalidate(){generation.current++;printing.current=false;setBusy(false);setReady(false);}
 function cancel(){invalidate();dialog.current?.close();onClose();}
 useEffect(()=>{
   const requests=generation;mounted.current=true;const previous=document.activeElement as HTMLElement|null;
   if(visible){dialog.current?.showModal();close.current?.focus();}
   return()=>{mounted.current=false;requests.current++;printing.current=false;if(previous?.isConnected)previous.focus();};
 },[visible]);
 useEffect(()=>{
   invalidate();setError('');setPages(0);if(!visible)return;
   try{
     const context=document.createElement('canvas').getContext('2d');if(!context)throw Error('Print preview unavailable.');
     const layout=layoutCallSheetPrint(request.data,request.name,{...request.options,paper,logo:request.options.logo??logo},(text,bold,size)=>{context.font=`${bold?'bold ':''}${size}px Arial`;return context.measureText(text).width;});
     setPages(layout.pages.length);setHtml(renderCallSheetPrint(layout));setPreviewKey(value=>value+1);
   }catch(e){setError((e as Error).message);}
 },[request,paper,visible,logo]);
 async function print(){
   const target=frame.current?.contentWindow;
   if(!ready||!visible||!target||printing.current)return;
   const ticket=++generation.current,expected=request;
   const current=()=>mounted.current&&ticket===generation.current&&latest.current.visible&&latest.current.request===expected&&frame.current?.contentWindow===target;
   printing.current=true;setBusy(true);setError('');
   try{
     if(authorize&&!await authorize()){if(current())setError('Reopen the call sheet to verify access before printing.');return;}
     if(!current())return;await target.document.fonts.ready;if(!current())return;
     target.focus();target.print();
   }catch{if(current())setError('Printing could not start. Please try again.');}
   finally{if(mounted.current&&ticket===generation.current){printing.current=false;setBusy(false);}}
 }
 if(!visible)return null;
 return createPortal(<dialog ref={dialog} className={styles.overlay} aria-label="Call sheet print preview" onCancel={e=>{e.preventDefault();cancel();}}><section className={styles.dialog}>
   <header className={styles.header}><h2>Call Sheet · Print / PDF</h2><button type="button" ref={close} onClick={cancel}>Close</button></header>
   <div className={styles.controls}><label>Paper<select value={paper} onChange={e=>{invalidate();setPaper(e.target.value as 'letter'|'a4');}}><option value="letter">US Letter · portrait</option><option value="a4">A4 · portrait</option></select></label><button type="button" className="btn btn-pink" disabled={!ready||busy||!pages} onClick={()=>void print()}>{busy?'Preparing…':'Print / Save PDF'}</button></div>
   <p className={styles.help}>Use the selected paper size, portrait, 100% scale, and no browser headers or footers. All pages include the date, version and page number.</p><p className={styles.count} role="status">{pages} {pages===1?'page':'pages'}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
   <iframe key={previewKey} ref={frame} className={styles.preview} title="Call sheet print preview" srcDoc={html} onLoad={()=>{if(latest.current.previewKey===previewKey&&latest.current.request===request&&latest.current.visible)setReady(true);}}/>
 </section></dialog>,document.body);
}
