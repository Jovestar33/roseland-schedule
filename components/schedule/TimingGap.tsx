'use client';
import {useState} from 'react';
import Modal from '@/components/modals/Modal';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {useCmsActions} from '@/lib/store/cmsStore';
import {parseCustomDuration,mDur} from '@/lib/time';
import {timingAnalysis} from '@/lib/flexible-time';
export default function TimingGap({gap}:{gap:{index:number;previous:number;minutes:number}}){
 const [open,setOpen]=useState(false),[action,setAction]=useState(''),[description,setDescription]=useState(''),[duration,setDuration]=useState(''),[error,setError]=useState('');
 const key=useScheduleStore(s=>s.rowKeys[gap.index]);const actions=useCmsActions();
 function save(){
  const s=useScheduleStore.getState(),i=s.rowKeys.indexOf(key),current=timingAnalysis(s.rows).gaps.find(g=>g.index===i);
  if(!current||current.minutes<=0){setError('This gap has changed. Close this window and review the times.');return;}
  const dur=parseCustomDuration(duration);if(!action||dur===null){setError('Choose an action and enter a duration in minutes or hours:minutes.');return;}
  s.pushUndo();s.addRowAfter(i-1,{action,dur,desc:description});setOpen(false);
 }
 return <tr className={`timing-gap-row${gap.minutes<0?' is-overlap':''}`}><td colSpan={11}><div><strong>{Math.abs(gap.minutes)} min {gap.minutes>0?'available':'overlap'}</strong><span>{gap.minutes>0?'Fill this gap, or adjust a duration or fixed time.':'These actions overlap. Shorten the work or change a fixed time.'}</span>{gap.minutes>0&&<button type="button" className="btn btn-light btn-sm" onClick={()=>{setAction('');setDescription('');setDuration(mDur(gap.minutes));setError('');setOpen(true);}}>Add action here</button>}</div>
 {open&&<Modal open title="Fill the gap" className="timing-modal" onClose={()=>setOpen(false)} footer={<><button className="btn btn-light" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-pink" onClick={save}>Add action</button></>}>
 <p>{gap.minutes} minutes are available here. Use part or all of that time.</p><div className="timing-fields"><label>Action<select autoFocus value={action} onChange={e=>setAction(e.target.value)}><option value="">Choose an action</option>{actions.filter(Boolean).map(a=><option key={a}>{a}</option>)}</select></label><label>Duration<input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="30 or 00:30"/></label></div><label className="timing-choice">Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>{error&&<p role="alert" className="dur-warn">{error}</p>}
 </Modal>}
 </td></tr>;
}
