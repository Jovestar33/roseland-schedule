'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import styles from './review-tools.module.css';

/** Closing a panel hides its controls without discarding retained operation state. */
export default function ReviewToolPanel({enabled,open,title,onClose,onBack,children,compact=false}:{compact?:boolean;enabled:boolean;open:boolean;title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    if(open&&!dialog.current?.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.current?.showModal();}
    else if(!open&&dialog.current?.open){dialog.current.close();if(opener.current?.isConnected)opener.current.focus();}
  },[enabled,open]);
  if(!enabled)return <>{children}</>;
  return <dialog ref={dialog} className={`${styles.panel} ${compact?styles.compact:''}`} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className={styles.header}><h2>{title}</h2><button className="btn btn-light btn-sm" aria-label={`Close ${title}`} onClick={onClose}><X size={18}/></button></div>
    {onBack&&<div className={styles.back}><button className="btn btn-light btn-sm" onClick={onBack}>← All tools</button></div>}
    <div className={styles.body}>{children}</div>
    {!compact&&<footer className={styles.footer}><span>Closing keeps your unfinished work.</span><button className="btn btn-light" onClick={onClose}>Close</button></footer>}
  </dialog>;
}
