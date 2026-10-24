'use client';
import {useState} from 'react';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {timingAnalysis,hasPlannedWork} from '@/lib/flexible-time';
import Modal from '@/components/modals/Modal';
export default function ScheduleTiming(){
 const rows=useScheduleStore(s=>s.rows),timing=useScheduleStore(s=>s.meta.timing);
 const [open,setOpen]=useState(false);
 const analysis=timingAnalysis(rows);
 const missing=rows.filter(r=>hasPlannedWork(r)&&!r.dur).length;
 const pending=analysis.unresolved.filter(i=>!!rows[i].dur).length;
 const gaps=analysis?.gaps.filter(g=>g.minutes>0).length??0,overlaps=analysis?.gaps.filter(g=>g.minutes<0).length??0;
 const issues=[gaps?`${gaps} gap${gaps===1?'':'s'}`:'',overlaps?`${overlaps} overlap${overlaps===1?'':'s'}`:'',analysis?.conflicts.length?`${analysis.conflicts.length} fixed-time conflict${analysis.conflicts.length===1?'':'s'}`:'',missing?`${missing} missing duration${missing===1?'':'s'}`:'',pending&&analysis.hasTimes?`${pending} action${pending===1?'':'s'} awaiting a time`:''].filter(Boolean);
 return <section className="schedule-timing" aria-label="Schedule timing"><div><strong>Timing</strong><span>{issues.length?issues.join(' · '):analysis.hasTimes?'Times connected':'Set any start or finish to begin. Durations work backward and forward.'}</span></div>
  <button type="button" className="btn btn-light btn-sm" onClick={()=>setOpen(true)}>Timing options</button>
  {open&&<Modal open onClose={()=>setOpen(false)} title="Timing options" className="timing-modal" footer={<button className="btn btn-light" onClick={()=>setOpen(false)}>Done</button>}>
   <p>Keep durations as the foundation. Click any start or finish time to fix it, then build the actions before and after it.</p>
   <p>Opening a schedule leaves its saved times unchanged. Timing edits recalculate the plan. Call time only stays fixed when you choose to fix it.</p>
   <label className="timing-choice">Between two fixed times<select value={timing?.between??'backward'} onChange={e=>{const s=useScheduleStore.getState();s.pushUndo();s.updateMeta({timing:{mode:'flexible',between:e.target.value as 'backward'|'forward'}});}}><option value="backward">Work backward from the next fixed time</option><option value="forward">Work forward from the previous fixed time</option></select></label>
   <p>Gaps show available minutes between actions. Add an action there, adjust a duration, or change a fixed time. Overlaps need attention; no duration is changed for you.</p>
   <p className="timing-help">During the trial, edit flexible timing here. Timing changes made in the legacy app need synchronization review.</p>
  </Modal>}
 </section>;
}
