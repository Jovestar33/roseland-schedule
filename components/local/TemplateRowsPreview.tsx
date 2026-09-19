import type { ScheduleRow } from '@/lib/types';
import styles from './template-preview.module.css';

/** A complete, readable preview of the exact rows being reviewed. */
export default function TemplateRowsPreview({rows,label='Template rows'}: {rows: readonly ScheduleRow[];label?:string}) {
  if (!rows.length) return <p className={styles.empty}>No rows in this preview.</p>;
  return <ol className={styles.rows} aria-label={label}>{rows.map((row,index) => <li key={index} className={styles.row}>
    <header><span className={styles.number}>{index+1}</span><strong>{row.action==='Other' ? row.otherText||'Other' : row.action||'Untitled row'}</strong><span className={styles.time}>{row.timeIn||'No start time'}{row.dur ? ` · ${row.dur}` : ''}</span></header>
    <div className={styles.content}>
      {(row.locName||row.loc||row.locAddress)&&<p><strong>{row.locName||row.loc}</strong>{row.locAddress&&<span className={styles.block}>{row.locAddress}</span>}{row.loc&&row.loc!==row.locName&&row.loc!==row.locAddress&&row.locName&&<span className={styles.block}>{row.loc}</span>}</p>}
      {row.desc&&<p>{row.desc}</p>}
      {row.notes&&<div><h4>Notes</h4><p>{row.notes}</p></div>}
      {[row.contactName,row.contactTitle,row.contactPhone,row.contactEmail].some(Boolean)&&<div><h4>Contact</h4><p>{[row.contactName,row.contactTitle,row.contactPhone,row.contactEmail].filter(Boolean).join('\n')}</p></div>}
      <div className={styles.flags}><span>{row.done?'Done':'Not done'}</span>{row.status&&<span>{row.status}</span>}{row.fixedIn&&<span>Fixed start</span>}{row.fixedOut&&<span>Fixed end{row.fixedOutTime?`: ${row.fixedOutTime}`:''}</span>}{row.sunLocked&&<span>Sun time locked</span>}</div>
      {!!row.subLocations?.length&&<div><h4>Additional locations</h4><ul className={styles.locations}>{row.subLocations.map(loc=><li key={loc.id}><strong>{loc.name||loc.loc||'Unnamed location'}</strong>{loc.address&&<span className={styles.block}>{loc.address}</span>}{loc.loc&&loc.name&&loc.loc!==loc.name&&loc.loc!==loc.address&&<span className={styles.block}>{loc.loc}</span>}{loc.desc&&<p>{loc.desc}</p>}<small>{loc.done?'Done':'Not done'}</small>{loc.locLat!=null&&loc.locLng!=null&&<small className={styles.block}>Coordinates: {loc.locLat}, {loc.locLng}</small>}</li>)}</ul></div>}
      {row.locLat!=null&&row.locLng!=null&&<small>Coordinates: {row.locLat}, {row.locLng}</small>}
    </div>
  </li>)}</ol>;
}
