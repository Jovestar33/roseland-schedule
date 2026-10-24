'use client';
import {useEffect,useRef,useState} from 'react';

/** An output belongs to the document and visible modal that requested it. */
export function useDocumentOutput({open,visible,identity,authorize}:{open:boolean;visible:boolean;identity:string;authorize?:()=>Promise<boolean>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const sequence=useRef(0),working=useRef(false),mounted=useRef(true);
  const latest=useRef({open,visible,identity});latest.current={open,visible,identity};
  function cancel(){sequence.current++;working.current=false;setBusy(false);setError('');}
  useEffect(()=>{cancel();},[open,visible,identity]);
  useEffect(()=>{const requests=sequence;mounted.current=true;return()=>{mounted.current=false;requests.current++;};},[]);
  async function run(work:(current:()=>boolean)=>void|Promise<void>){
    if(working.current||!open||!visible)return;
    const ticket=++sequence.current;working.current=true;setBusy(true);setError('');
    const current=()=>mounted.current&&ticket===sequence.current&&latest.current.open&&latest.current.visible&&latest.current.identity===identity;
    try{
      if(authorize&&!await authorize())return;
      if(current())await work(current);
    }catch{if(current())setError('This document could not be prepared. Please try again.');}
    finally{if(mounted.current&&ticket===sequence.current){working.current=false;setBusy(false);}}
  }
  return {busy,error,run,cancel};
}
