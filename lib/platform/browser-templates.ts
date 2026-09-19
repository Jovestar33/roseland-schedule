import {validateFileDocument} from './schedule-files.ts';
import type {ScheduleRow} from '../types.ts';
export interface BrowserTemplate {name:string;rows:ScheduleRow[];savedAt:number}
export function parseBrowserTemplates(raw:string):BrowserTemplate[]{
 if(new TextEncoder().encode(raw).length>20_000_000)throw Error('Template file exceeds 20 MB. The source was not changed.');
 let data:unknown;try{data=JSON.parse(raw);}catch{throw Error('This file is not valid JSON. Choose a complete browser-template backup; nothing was imported.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Choose a browser-template JSON object.');
 const entries=Object.entries(data);if(entries.length>500)throw Error('More than 500 templates were found. No partial import was prepared.');
 return entries.map(([name,value])=>{const v=value as {rows:ScheduleRow[];savedAt:number};if(!name.trim()||name.length>150||/[\x00-\x1f\x7f]/.test(name)||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['rows','savedAt'].includes(k))||!Number.isSafeInteger(v.savedAt)||v.savedAt<0)throw Error('An invalid browser template was found. No fields were removed and the original is retained.');validateFileDocument({meta:{},rows:v.rows});return {name,rows:structuredClone(v.rows),savedAt:v.savedAt};});
}
