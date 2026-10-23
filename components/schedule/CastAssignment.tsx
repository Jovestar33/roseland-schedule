'use client';
import {useScheduleStore} from '@/lib/store/scheduleStore';
import {hasCastName,toggleCastName} from '@/lib/cast-assignment';
import type {ScheduleRow} from '@/lib/types';
import AutoResizeTextarea from './AutoResizeTextarea';
import styles from './cast-assignment.module.css';
export default function CastAssignment({index,row}:{index:number;row:ScheduleRow}){
 const contacts=useScheduleStore(s=>s.meta.productionContacts),updateRow=useScheduleStore(s=>s.updateRow),pushUndo=useScheduleStore(s=>s.pushUndo);
 const cast=(contacts??[]).filter(c=>c.type==='cast'),value=row.cast??'';
 return <div className={styles.wrap}>
 <details className={styles.control}><summary aria-label={value?'Edit cast / participants':'Add cast / participants'}>{value?<><span className={styles.label}>Cast / participants</span><span className={styles.names}>{value}</span></>:'＋ Cast / participants'}</summary>
 <div className={styles.editor}>
 {cast.length?<fieldset><legend>Choose from production contacts</legend>{cast.map(c=><label className={styles.choice} key={c.id}><input type="checkbox" checked={hasCastName(value,c.name)} onChange={e=>{pushUndo();updateRow(index,{cast:toggleCastName(useScheduleStore.getState().rows[index].cast??'',c.name,e.target.checked)});}}/><span>{c.name}{c.role&&<small>{c.role}</small>}</span></label>)}</fieldset>:<p>Add cast in Share → Contact Sheet, or enter names below.</p>}
 <label className={styles.label}>Names / scene notes</label><AutoResizeTextarea className="ci-ta" label="Cast / participants" value={value} onChange={cast=>updateRow(index,{cast})} onFocus={pushUndo} placeholder="Names needed for this action…"/>
 <p>Names are saved with this action. Contact details and call times stay on the call sheet.</p><button type="button" className="btn btn-light btn-sm" onClick={e=>{const details=e.currentTarget.closest('details');if(details){details.open=false;details.querySelector('summary')?.focus();}}}>Close</button>
 </div></details>
 {value&&<div className={`print-field-text ${styles.print}`} aria-hidden="true">Cast / participants: {value}</div>}
 </div>;
}
