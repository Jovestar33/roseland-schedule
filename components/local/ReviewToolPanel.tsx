'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {X} from 'lucide-react';
import styles from './review-tools.module.css';

/** Closing a panel hides its controls without discarding retained operation state. */
export default function ReviewToolPanel({enabled,open,title,onClose,onBack,children,compact=false}:{compact?:boolean;enabled:boolean;open:boolean;title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
  const [closing,setClosing]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const close=useRef(onClose);close.current=onClose;
  const completedExit=useRef(false);
  function requestClose(){
    if(timer.current)return;
    if(compact||window.matchMedia('(prefers-reduced-motion: reduce)').matches){close.current();return;}
    setClosing(true);
    timer.current=setTimeout(()=>{timer.current=null;completedExit.current=true;close.current();},200);
  }
  useEffect(()=>{
    const node=dialog.current;
    function finish(){node?.close();setClosing(false);if(opener.current?.isConnected)opener.current.focus();}
    if(!enabled){node?.close();return;}
    if(open){
      completedExit.current=false;setClosing(false);
      if(!node?.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();}
    }else if(node?.open){
      if(completedExit.current||compact||window.matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
      else{setClosing(true);timer.current=setTimeout(()=>{timer.current=null;finish();},200);}
    }
    return()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  },[enabled,open,compact]);
  if(!enabled)return <>{children}</>;
  return <dialog ref={dialog} className={`${styles.panel} ${compact?styles.compact:''}`} data-closing={closing||undefined} aria-label={title} onCancel={event=>{event.preventDefault();requestClose();}}>
    <div className={styles.header}><h2>{title}</h2><button className="btn btn-light btn-sm" aria-label={`Close ${title}`} onClick={requestClose}><X size={18}/></button></div>
    {onBack&&<div className={styles.back}><button className="btn btn-light btn-sm" onClick={onBack}>← All tools</button></div>}
    <div className={styles.body}>{children}</div>
    {!compact&&<footer className={styles.footer}><button className="btn btn-light" onClick={requestClose}>Close</button></footer>}
  </dialog>;
}
