import type {ScheduleRow} from './types';
/** Pure duration/anchor solver. A missing duration is unknown, never zero. */
export function clockMinutes(value:string):number|null {
 const match=/^(0?[1-9]|1[0-2]):([0-5][0-9]) (AM|PM)$/.exec(value??'');
 return match?(Number(match[1])%12+(match[3]==='PM'?12:0))*60+Number(match[2]):null;
}
export function durationMinutes(value:string):number|null {
 const match=/^(\d{1,3}):([0-5][0-9])$/.exec(value??'');return match?Number(match[1])*60+Number(match[2]):null;
}
export function clockAt(minutes:number):string {const t=((minutes%1440)+1440)%1440,h=Math.floor(t/60);return `${h%12||12}:${String(t%60).padStart(2,'0')} ${h>=12?'PM':'AM'}`;}
export function dayLabel(day:number):string{return day===0?'':` (${day>0?'+':''}${day} day${Math.abs(day)===1?'':'s'})`;}
export function startMinutes(row:ScheduleRow):number|null {const t=clockMinutes(row.timeIn);return t===null?null:t+(row.timeInDay??0)*1440;}
export function finishMinutes(row:ScheduleRow):number|null {
 if(row.fixedOut&&row.fixedOutTime){const t=clockMinutes(row.fixedOutTime);return t===null?null:t+(row.fixedOutDay??0)*1440;}
 const start=startMinutes(row),duration=durationMinutes(row.dur);return start===null||duration===null?null:start+duration;
}
export function hasPlannedWork(row:ScheduleRow){return !row.sunLocked&&!!(row.action||row.desc||row.loc||row.notes||row.dur||row.fixedIn||row.fixedOut);}
export type TimingConflict={index:number;kind:string;msg:string;detail?:string};
export function solveFlexibleTimes(input:ScheduleRow[],between:'backward'|'forward'='backward',fallbackStart:number|null=null){
 const rows=input.map(r=>({...r})),indices=rows.flatMap((r,i)=>hasPlannedWork(r)?[i]:[]);
 const times=indices.map(()=>({start:null as number|null,end:null as number|null}));
 const anchors:number[]=[],conflicts:TimingConflict[]=[];
 indices.forEach((index,i)=>{
  const r=rows[index],d=durationMinutes(r.dur),start=r.fixedIn?startMinutes(r):null,end=r.fixedOut&&r.fixedOutTime?finishMinutes(r):null;
  if(start!==null||end!==null){anchors.push(i);times[i]={start:start??(end!==null&&d!==null?end-d:null),end:end??(start!==null&&d!==null?start+d:null)};}
  if(start!==null&&end!==null&&d!==null&&start+d!==end)conflicts.push({index,kind:'fixedOutMismatch',msg:`${Math.abs(start+d-end)} min ${start+d>end?'over':'short of'} fixed finish.`,detail:'Both times are fixed. Change a duration or release one fixed time.'});
  else if(start!==null&&end!==null&&end<start)conflicts.push({index,kind:'negative',msg:'Finish is before start.',detail:'Check the day selection for overnight work.'});
 });
 function back(from:number,to:number,cursor:number|null){for(let i=from;i>=to;i--){const d=durationMinutes(rows[indices[i]].dur);times[i]=d!==null&&cursor!==null?{start:cursor-d,end:cursor}:{start:null,end:null};cursor=times[i].start;}}
 function forward(from:number,to:number,cursor:number|null,fillUnknown=false){for(let i=from;i<=to;i++){const d=durationMinutes(rows[indices[i]].dur);if(!fillUnknown||times[i].start===null)times[i]={start:cursor,end:cursor!==null&&d!==null?cursor+d:null};cursor=times[i].end;}}
 if(!anchors.length&&fallbackStart!==null)forward(0,indices.length-1,fallbackStart);
 if(anchors.length){
  back(anchors[0]-1,0,times[anchors[0]].start);
  for(let k=1;k<anchors.length;k++){const a=anchors[k-1],b=anchors[k];
   if(between==='backward'){back(b-1,a+1,times[b].start);forward(a+1,b-1,times[a].end,true);}
   else {forward(a+1,b-1,times[a].end);/* Resolve the far side of a missing duration from its next anchor. */let lastUnknown=-1;for(let i=a+1;i<b;i++)if(durationMinutes(rows[indices[i]].dur)===null)lastUnknown=i;if(lastUnknown>=0)back(b-1,lastUnknown+1,times[b].start);}
  }
  forward(anchors.at(-1)!+1,indices.length-1,times[anchors.at(-1)!].end);
 }
 const gaps:{index:number;previous:number;minutes:number}[]=[];
 for(let i=1;i<indices.length;i++){const end=times[i-1].end,start=times[i].start;if(end!==null&&start!==null&&end!==start)gaps.push({index:indices[i],previous:indices[i-1],minutes:start-end});}
 indices.forEach((index,i)=>{const r=rows[index],t=times[i].start;if(!r.fixedIn){r.timeIn=t===null?'':clockAt(t);if(t===null)delete r.timeInDay;else r.timeInDay=Math.floor(t/1440);}});
 rows.forEach(r=>{if(!r.sunLocked&&!hasPlannedWork(r)){r.timeIn='';delete r.timeInDay;}});
 return {rows,gaps,conflicts,anchors:anchors.length,unresolved:indices.filter((_,i)=>times[i].start===null||times[i].end===null)};
}
/** Inspect exactly the visible saved rows; opening a schedule never solves it. */
const analysisCache=new WeakMap<ScheduleRow[],ReturnType<typeof inspectTiming>>();
function inspectTiming(rows:ScheduleRow[]){
 const indices=rows.flatMap((r,i)=>hasPlannedWork(r)?[i]:[]),gaps:{index:number;previous:number;minutes:number}[]=[],conflicts:TimingConflict[]=[];
 indices.forEach((index,i)=>{
  const row=rows[index],begin=startMinutes(row),finish=finishMinutes(row),duration=durationMinutes(row.dur);
  if(row.fixedOut&&row.fixedOutTime&&begin!==null&&finish!==null&&duration!==null&&begin+duration!==finish)conflicts.push({index,kind:'fixedOutMismatch',msg:`${Math.abs(begin+duration-finish)} min ${begin+duration>finish?'over':'short of'} fixed finish.`,detail:'Change a duration or release a fixed time.'});
  else if(begin!==null&&finish!==null&&finish<begin)conflicts.push({index,kind:'negative',msg:'Finish is before start.',detail:'Check the day selection for overnight work.'});
  if(i){const previous=indices[i-1],last=finishMinutes(rows[previous]);if(last!==null&&begin!==null&&last!==begin)gaps.push({index,previous,minutes:begin-last});}
 });
 return {gaps,conflicts,anchors:indices.filter(i=>rows[i].fixedIn||rows[i].fixedOut).length,hasTimes:indices.some(i=>startMinutes(rows[i])!==null),unresolved:indices.filter(i=>startMinutes(rows[i])===null||finishMinutes(rows[i])===null)};
}
export function timingAnalysis(rows:ScheduleRow[],_between?:'backward'|'forward'){
 let result=analysisCache.get(rows);if(!result){result=inspectTiming(rows);analysisCache.set(rows,result);}return result;
}
