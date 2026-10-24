'use client';
import { useRef, useState, useEffect, useContext, useId } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { printSchedule } from '@/lib/print';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';
import { ModalVisibilityContext } from '@/components/modals/Modal';
import ContactSheetModal from '@/components/modals/ContactSheetModal';
import CallSheetModal from '@/components/modals/CallSheetModal';
import ScheduleEmail from '@/components/local/ScheduleEmail';
import {useCallSheetPublishing} from '@/components/local/CallSheetPublishingContext';

export default function ShareDropdown({ readOnly = false, onModalChange, authorizeOutput, onManageLinks }: { readOnly?: boolean; onModalChange?: (open: boolean) => void; authorizeOutput?:()=>Promise<boolean>; onManageLinks?:()=>void } = {}) {
  const publishing=useCallSheetPublishing();
  const [emailOpen,setEmailOpen]=useState(false);
  const local = useLocalEditor(), visible = useContext(ModalVisibilityContext);
  const scheduleName    = useScheduleStore((s) => s.scheduleName);
  const documentSession = useScheduleStore((s) => s.documentSession);
  const getScheduleData = useScheduleStore((s) => s.getScheduleData);
  const [open, setOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [callSheetOpen,    setCallSheetOpen   ] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0, maxHeight:0 });
  const [preparing,setPreparing]=useState(false),[error,setError]=useState('');
  const action=useRef(0),working=useRef(false),mounted=useRef(true),latest=useRef({visible,documentSession,scheduleName});latest.current={visible,documentSession,scheduleName};
  useEffect(()=>{const requests=action;mounted.current=true;return()=>{mounted.current=false;requests.current++;};},[]);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    }
    function onScroll(event?: Event) { if(event?.target && wrapRef.current?.contains(event.target as Node))return; close(false); }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault(); close();
      }
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.visualViewport?.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => { onModalChange?.(callSheetOpen || contactSheetOpen || emailOpen); }, [callSheetOpen, contactSheetOpen, emailOpen, onModalChange]);
  useEffect(() => { if (!visible) close(false); }, [visible]);

  function toggle() {
    if(open){close();return;}
    setError('');
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const height=window.visualViewport?.height ?? window.innerHeight;
      const count=4+(local&&publishing&&!readOnly?1:0)+(onManageLinks?1:0);
      const top=Math.max(8,Math.min(r.bottom+4,height-(count*40+24)));
      setDropPos({ top, right:Math.max(8,Math.min(window.innerWidth-r.right,window.innerWidth-200)), maxHeight:Math.max(0,height-top-8) });
    }
    setOpen(o => !o);
  }

  function close(restoreFocus=true) { action.current++;working.current=false;setPreparing(false);setOpen(false);if(restoreFocus)btnRef.current?.focus(); }

  async function withOutputAccess(work:()=>void) {
    if(working.current||!visible)return;
    const ticket=++action.current;working.current=true;setPreparing(true);setError('');
    const current=()=>mounted.current&&ticket===action.current&&latest.current.visible&&latest.current.documentSession===documentSession&&latest.current.scheduleName===scheduleName;
    try{
      if(authorizeOutput&&!await authorizeOutput())return;
      if(!current())return;
      close();work();
    }catch{if(current())setError('This option could not open. Please try again.');}
    finally{if(ticket===action.current){working.current=false;setPreparing(false);}}
  }

  const handlePrint=()=>withOutputAccess(()=>{void printSchedule(scheduleName ?? 'Schedule', getScheduleData(), authorizeOutput, local);});
  const handleContactSheet=()=>withOutputAccess(()=>setContactSheetOpen(true));
  const handleCallSheet=()=>withOutputAccess(()=>setCallSheetOpen(true));
  const handleExportJson=()=>withOutputAccess(()=>{
    const data=getScheduleData(), name=scheduleName??'Schedule',today=new Date().toISOString().slice(0,10);
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`${name} – ${today}.json`;a.click();URL.revokeObjectURL(url);
  });

  return (
    <>
    <div className="tbar-drop-wrap" ref={wrapRef}>
      <button
        className="btn btn-light btn-sm"
        ref={btnRef}
        onClick={toggle}
        title="Share"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <span className="tbar-icon">⬆</span>
        <span className="tbar-label"> Share</span>
        <span className={`tbar-chev${open ? ' open' : ''}`}> ▾</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="tbar-drop"
          style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, left: 'auto', maxHeight:dropPos.maxHeight, maxWidth:'calc(100vw - 16px)', overflowY:'auto', zIndex: 9999 }}
        >
          {local && publishing && !readOnly && <button className="tbar-drop-item" disabled={preparing} onClick={()=>{close();setEmailOpen(true);}}>✉ Send to group</button>}
          {onManageLinks && <button className="tbar-drop-item" disabled={preparing} onClick={()=>{close();onManageLinks();}}>🔗 Share schedule</button>}
          <button className="tbar-drop-item" disabled={preparing} onClick={handlePrint}>🖨 Print / PDF</button>
          <button className="tbar-drop-item" disabled={preparing} onClick={handleExportJson}>⬇ Export JSON</button>
          <button className="tbar-drop-item" disabled={preparing} onClick={handleContactSheet}>📋 Contact Sheet</button>
          <button className="tbar-drop-item" disabled={preparing} onClick={handleCallSheet}>📄 Call Sheet</button>
          {preparing&&<><p role="status" style={{padding:'8px 12px',fontSize:12,margin:0}}>Checking access…</p><button className="tbar-drop-item" onClick={()=>close()}>Cancel</button></>}
          {error&&<p role="alert" style={{padding:'8px 12px',fontSize:12,margin:0,lineHeight:1.5}}>{error}</p>}
        </div>
      )}
    </div>
    {local && publishing && !readOnly && <ScheduleEmail open={emailOpen} onClose={()=>setEmailOpen(false)}/>}
    <ContactSheetModal
      readOnly={readOnly}
      authorizeOutput={authorizeOutput}
      open={contactSheetOpen}
      onClose={() => setContactSheetOpen(false)}
    />
    <CallSheetModal
      authorizeOutput={authorizeOutput}
      open={callSheetOpen}
      readOnly={readOnly}
      onClose={() => setCallSheetOpen(false)}
    />
</>
  );
}
