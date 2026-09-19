'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import styles from './review-tools.module.css';

/** Closing a panel hides its controls without discarding retained operation state. */
export default function ReviewToolPanel({enabled,open,title,onClose,onBack,children}:{enabled:boolean;open:boolean;title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!enabled)return;
    if(open&&!dialog.current?.open)dialog.current?.showModal();
    else if(!open&&dialog.current?.open)dialog.current.close();
  },[enabled,open]);
  if(!enabled)return <>{children}</>;
  return <dialog ref={dialog} className={styles.panel} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className={styles.header}><h2>{title}</h2><button className="btn btn-light btn-sm" aria-label={`Close ${title}`} onClick={onClose}><X size={18}/></button></div>
    {onBack&&<div className={styles.back}><button className="btn btn-light btn-sm" onClick={onBack}>← All tools</button></div>}
    <div className={styles.body}>{children}</div>
  </dialog>;
}
