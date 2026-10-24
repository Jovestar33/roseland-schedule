'use client';
import {useRef,useState} from 'react';
import {LockKeyhole} from 'lucide-react';
import Modal from '@/components/modals/Modal';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {displayTimeIn,displayTimeOut} from '@/lib/time';
import {clockAt,clockMinutes,finishMinutes} from '@/lib/flexible-time';
import type {ScheduleRow} from '@/lib/types';

export default function FlexibleTimeCell({index,row,edge}:{index:number;row:ScheduleRow;edge:'start'|'finish'}){
 const clockRef=useRef<HTMLInputElement>(null),dayRef=useRef<HTMLSelectElement>(null);
 const key=useScheduleStore(s=>s.rowKeys[index]);
 const [open,setOpen]=useState(false),[clock,setClock]=useState(''),[day,setDay]=useState('0'),[error,setError]=useState('');
 const fixed=edge==='start'?row.fixedIn:row.fixedOut;
 const label=edge==='start'?'start':'finish';
 const display=edge==='start'?displayTimeIn(row):displayTimeOut(row);
 function begin(){
  const value=edge==='start'?row.timeIn:(row.fixedOut?row.fixedOutTime:clockAt(finishMinutes(row)??0));
  const minute=clockMinutes(value);
  setClock((edge==='finish'&&!display)||minute===null?'':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`);
  setDay(String(edge==='start'?(row.timeInDay??0):row.fixedOut?(row.fixedOutDay??0):Math.floor((finishMinutes(row)??0)/1440)));
  setError('');setOpen(true);
 }
 function commit(release=false){
  const state=useScheduleStore.getState(),i=state.rowKeys.indexOf(key);
  if(i<0){setError('This action has changed. Close this window and try again.');return;}
  const enteredClock=clockRef.current?.value??clock,enteredDay=dayRef.current?.value??day;
  if(!release&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(enteredClock)||!enteredDay.trim()||!Number.isInteger(Number(enteredDay))||Math.abs(Number(enteredDay))>1000000)){setError('Choose a time and a whole-number day offset.');return;}
  const [h,m]=enteredClock.split(':').map(Number),value=clockAt(h*60+m);
  state.pushUndo();state.updateRow(i,edge==='start'?(release?{fixedIn:false}:{fixedIn:true,timeIn:value,timeInDay:Number(enteredDay)}):(release?{fixedOut:false,fixedOutTime:'',fixedOutDay:0}:{fixedOut:true,fixedOutTime:value,fixedOutDay:Number(enteredDay)}));setOpen(false);
 }
 return <><button type="button" className={`flex-time-value${fixed?' is-fixed':''}`} onClick={begin} aria-label={`${fixed?'Edit fixed':'Set fixed'} ${label}${display?`: ${display}`:''}`} title={fixed?`Fixed ${label} — edit or release`:`Set a fixed ${label}`}>
  {fixed&&<LockKeyhole size={12} aria-hidden="true"/>}<span>{display||'—'}</span>
 </button>{open&&<Modal open title={`Fixed ${label}`} className="timing-modal" onClose={()=>setOpen(false)} footer={<>
  {fixed&&<button className="btn btn-light" onClick={()=>commit(true)}>Release fixed time</button>}<button className="btn btn-light" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-pink" onClick={()=>commit()}>Set time</button>
 </>}><p>Durations stay unchanged. Other actions work {edge==='finish'?'backward from this finish':'around this start'}.</p>
  <div className="timing-fields"><label>{edge==='start'?'Start':'Finish'} time<input autoFocus type="time" step="60" ref={clockRef} defaultValue={clock}/></label>
  <label>Day<select ref={dayRef} defaultValue={day}>{!['-1','0','1','2','3','4','5','6','7'].includes(day)&&<option value={day}>{Number(day)>0?'+':''}{day} days from shoot date</option>}<option value="-1">Previous day</option><option value="0">Shoot date</option><option value="1">Next day</option>{[2,3,4,5,6,7].map(d=><option key={d} value={d}>{d} days after shoot date</option>)}</select></label></div>
  {edge==='finish'&&<p className="timing-help">This is an exact finish time. For a hard out, put it on the last action at that location.</p>}
  {error&&<p role="alert" className="dur-warn">{error}</p>}
 </Modal>}</>;
}
