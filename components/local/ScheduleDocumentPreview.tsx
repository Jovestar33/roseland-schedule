import type { ScheduleData } from '@/lib/types';
import { makeMeta } from '@/lib/rowNormalizer';
import TemplateRowsPreview from './TemplateRowsPreview';
import styles from './document-preview.module.css';

export default function ScheduleDocumentPreview({document}: {document: Partial<ScheduleData>}) {
  const meta=makeMeta(document.meta), rows=document.rows??[];
  const fields=[['Production',meta.projectName],['Phase',meta.phase],['Day',meta.dayNumber==null?'':`${meta.dayNumber}${meta.totalDays?` of ${meta.totalDays}`:''}`],['Date',meta.date],['Town / location',meta.town],['Producer',meta.prod],['Director',meta.dir],['Camera',meta.dp]];
  const callLabels:Record<string,string>={basecamp:'Basecamp',parking:'Parking',hospital:'Hospital',emergency:'Emergency contact',mealNotes:'Meal notes',safetyNotes:'Safety notes',specialInstructions:'Special instructions',notes:'Call-sheet notes'};
  return <div className={styles.preview}>
    <dl className={styles.metadata}>{fields.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {meta.lat!=null&&meta.lng!=null&&<p className={styles.subtle}>Location coordinates: {meta.lat}, {meta.lng}</p>}
    {meta.wx&&<section aria-label="Saved weather"><h3>Saved weather</h3><p>{[['Sunrise',meta.wx.sunrise],['Sunset',meta.wx.sunset],['Conditions',meta.wx.cond],['High',meta.wx.maxF==null?null:`${meta.wx.maxF}°F`],['Low',meta.wx.minF==null?null:`${meta.wx.minF}°F`],['Precipitation',meta.wx.prec==null?null:`${meta.wx.prec}%`]].filter(([,value])=>value!=null&&value!=='').map(([label,value])=>`${label}: ${value}`).join(' · ')}</p>{meta.wx.noForecast&&<p>Forecast unavailable; saved sun times only.</p>}{meta.wx.fetchedAt&&<p className={styles.subtle}>Updated: {meta.wx.fetchedAt}</p>}</section>}
    <h3>{rows.length} {rows.length===1?'row':'rows'}</h3>
    <TemplateRowsPreview rows={rows} label="Schedule rows"/>
    {!!Object.values(meta.callsheet??{}).some(Boolean)&&<section aria-label="Saved call sheet"><h3>Call sheet</h3><dl className={styles.callsheet}>{Object.entries(meta.callsheet??{}).filter(([,value])=>value).map(([key,value])=><div key={key}><dt>{callLabels[key]??key}</dt><dd>{value}</dd></div>)}</dl></section>}
  </div>;
}
