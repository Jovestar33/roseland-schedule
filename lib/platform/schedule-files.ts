import type { StoredSchedule } from './schedule-repository.ts';
import { parseScheduleBackup } from '../schedule-backup-format.ts';
import { ScheduleLifecycleController, sameJson, type LifecycleTransport } from './schedule-lifecycle-controller.ts';
export const FILE_BYTES = 20_000_000, FILE_COUNT = 500;
type Doc = StoredSchedule['document'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v,null,2)).length;
function invalid(message: string): never { throw new Error(message); }
const text = (v: unknown) => typeof v === 'string' && [...v].length <= 10000;
const number = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
/** Mirrors the accepted SQL document shape; rejects unfamiliar fields rather than stripping them. SQL remains authoritative. */
export function validateFileDocument(doc: unknown): asserts doc is Doc {
  if (!object(doc) || !object(doc.meta) || !Array.isArray(doc.rows) || doc.rows.length > 5000 || bytes(doc) > 2_000_000 || Object.keys(doc).some(k => !['meta','rows','savedAt'].includes(k))) invalid('Invalid or oversized schedule document. No fields were removed.');
  if ('savedAt' in doc && (!number(doc.savedAt, Number.MAX_SAFE_INTEGER) || (doc.savedAt as number) < 0)) invalid('Invalid saved time.');
  for (const [k,v] of Object.entries(doc.meta)) {
    if ('town date prod dir dp projectName phase'.split(' ').includes(k)) { if (!text(v)) invalid('Invalid metadata text: '+k); }
    else if (['lat','lng','dayNumber','totalDays'].includes(k)) {
      if (v !== null && (!number(v,k==='lat'?90:k==='lng'?180:1000000) || (['dayNumber','totalDays'].includes(k) && (!Number.isInteger(v) || (v as number)<1)))) invalid('Invalid metadata number: '+k);
    } else if (k==='wx') {
      if (v===null) continue;
      if (!object(v)) invalid('Invalid weather.');
      for (const [field,x] of Object.entries(v)) {
        if ('sunrise sunset cond fetchedAt town'.split(' ').includes(field) ? !text(x) : 'maxC minC maxF minF prec code'.split(' ').includes(field) ? !number(x,1000000) : field==='noForecast' ? typeof x!=='boolean' : true) invalid('Invalid weather field: '+field);
      }
    } else if (k==='callsheet') {
      if (!object(v) || Object.entries(v).some(([field,x])=> !'basecamp parking hospital emergency mealNotes safetyNotes specialInstructions notes'.split(' ').includes(field)||!text(x))) invalid('Invalid Call Sheet.');
    } else invalid('Unrecognized metadata: '+k);
  }
  if (typeof doc.meta.town==='string' && [...doc.meta.town.trim()].length>160) invalid('Town exceeds 160 characters.');
  const date=doc.meta.date;
  if (date && (typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)) invalid('Invalid schedule date.');
  for (const row of doc.rows) {
    if (!object(row)) invalid('Invalid row.');
    for (const [k,v] of Object.entries(row)) {
      if ('action otherText desc loc locName locAddress notes status contactName contactTitle contactPhone contactEmail timeIn dur fixedOutTime'.split(' ').includes(k)) {
        if (!text(v)) invalid('Invalid row text: '+k);
        if (v && (['timeIn','fixedOutTime'].includes(k) ? !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(v as string) : k==='dur' ? !/^[0-9]{1,3}:[0-5][0-9]$/.test(v as string) : false)) invalid('Invalid row time: '+k);
      } else if (['done','sunLocked','fixedIn','fixedOut'].includes(k)) { if (typeof v!=='boolean') invalid('Invalid row flag.'); }
      else if (['locLat','locLng'].includes(k)) { if (v!==null&&!number(v,k==='locLat'?90:180)) invalid('Invalid coordinate.'); }
      else if (k==='subLocations') {
        if (!Array.isArray(v)||v.length>100) invalid('Invalid nested locations.');
        for (const child of v) {
          if (!object(child)||typeof child.loc!=='string') invalid('Invalid nested location.');
          for (const [field,x] of Object.entries(child)) if (['id','loc','desc','name','address'].includes(field)?!text(x):field==='done'?typeof x!=='boolean':['locLat','locLng'].includes(field)?x!==null&&!number(x,field==='locLat'?90:180):true) invalid('Invalid nested location field: '+field);
        }
      } else invalid('Unrecognized row field: '+k);
    }
  }
}
export function validateFileName(name: string, slug: string) {
  if (!name || name!==name.trim() || [...name].length>160 || /[\x00-\x1f\x7f]/.test(name) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160) invalid('Use a nonempty name (up to 160 characters) and a lowercase, hyphenated slug.');
}
export function suggestedSlug(name:string) { return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160).replace(/-$/,'') || 'schedule'; }
export function canonicalJson(value:unknown):string {
  const ordered=(v:unknown):unknown=>Array.isArray(v)?v.map(ordered):object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,ordered(x)])):v;
  return JSON.stringify(ordered(value));
}
export async function documentHash(value:unknown) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value))))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
export interface FileEntry { name:string; slug:string; data:Doc; sha256?:string; source?:{id:string;organization:string;production:string;day:string|null;version:number;status:string;deletedAt:string|null} }
export interface ScheduleFile { format:'production-command-schedule-only';version:1;exportedAt:string;scope:string;excludes:string[];schedules:FileEntry[] }
export async function encodeScheduleFile(records:StoredSchedule[]):Promise<ScheduleFile> {
  if(records.length>FILE_COUNT) invalid('More than 500 schedules are readable. No partial file was produced.');
  const schedules:FileEntry[]=[];
  for(const r of records) {validateFileDocument(r.document);schedules.push({name:r.display_name,slug:r.slug,data:structuredClone(r.document),sha256:await documentHash(r.document),source:{id:r.id,organization:r.organization_id,production:r.production_id,day:r.production_day_id,version:r.document_version,status:r.status,deletedAt:r.deleted_at}});}
  const result:ScheduleFile={format:'production-command-schedule-only',version:1,exportedAt:new Date().toISOString(),scope:'All schedules readable by the signed-in account, including readable archived and deleted schedules. Saved documents only; not a transactional database snapshot.',excludes:['history','snapshots','templates','CMS','memberships','hierarchy definitions','legacy aliases','browser-only data'],schedules};
  if(bytes(result)>FILE_BYTES) invalid('Export exceeds 20 MB. No partial file was produced.');return result;
}
export async function parseScheduleFile(contents:string,singleName:string):Promise<FileEntry[]> {
  if(new TextEncoder().encode(contents).length>FILE_BYTES) invalid('File exceeds 20 MB.');
  const root:unknown=JSON.parse(contents);let entries:FileEntry[];
  if(object(root)&&root.format==='production-command-schedule-only') {
    if(root.version!==1||!Array.isArray(root.schedules)||Object.keys(root).some(k=>!['format','version','exportedAt','scope','excludes','schedules'].includes(k))) invalid('Unsupported schedule-only file.');
    entries=root.schedules as FileEntry[];
    for(const entry of entries) {
      if(!object(entry)||Object.keys(entry).some(k=>!['name','slug','data','sha256','source'].includes(k))||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)) invalid('Missing document checksum.');
      validateFileDocument(entry.data);
      if(await documentHash(entry.data)!==entry.sha256) invalid('Document checksum mismatch. No schedules were imported.');
    }
  } else {
    if(object(root)&&root.format==='roseland-schedules'&&Array.isArray(root.schedules)&&root.schedules.some(e=>!object(e)||Object.keys(e).some(k=>!['name','data'].includes(k)))) invalid('Unsupported import instructions. Only create-only schedule documents are accepted.');
    entries=parseScheduleBackup(contents,singleName).map(e=>({name:e.name,slug:suggestedSlug(e.name),data:e.data}));
  }
  if(!entries.length||entries.length>FILE_COUNT) invalid('Choose a file containing 1–500 schedules.');
  for(const e of entries) {if(typeof e.name!=='string'||typeof e.slug!=='string') invalid('Missing schedule name or slug.');validateFileName(e.name,e.slug);validateFileDocument(e.data);}
  return structuredClone(entries);
}
export interface CreateSelection { name:string;slug:string;data:Doc }
/** Each immutable reviewed item has its own identity and existing lifecycle recovery contract. */
export class ScheduleFileImport {
  readonly items:ScheduleLifecycleController[];
  busy=false;
  readonly actor:string; readonly organization:string; readonly day:string;
  constructor(actor:string,organization:string,day:string,entries:CreateSelection[],uuid:()=>string=()=>crypto.randomUUID()) {
    this.actor=actor;this.organization=organization;this.day=day;
    if(!entries.length||entries.length>FILE_COUNT) invalid('Choose 1–500 schedules.');
    const names=new Set<string>(),slugs=new Set<string>(),ids=new Set<string>();
    this.items=entries.map(e=>{validateFileName(e.name,e.slug);validateFileDocument(e.data);const n=e.name.toLowerCase();if(names.has(n)||slugs.has(e.slug)) invalid('Duplicate names or slugs in this destination. Edit the review first.');names.add(n);slugs.add(e.slug);const id=uuid();if(ids.has(id)) invalid('Duplicate generated identity.');ids.add(id);const c=new ScheduleLifecycleController();c.bind(actor);c.prepareCreate(organization,id,day,e.name,e.slug,e.data);return c;});
  }
  get complete(){return this.items.every(c=>c.phase==='success');}
  get started(){return this.items.some(c=>c.phase!=='review');}
  async execute(transport:LifecycleTransport,allowed:()=>boolean,checkOnly=false){
    if(this.busy||!allowed())return;this.busy=true;
    try {for(const c of this.items){if(!allowed())break;if(c.phase==='success')continue;await c.execute(transport,checkOnly);if(c.result?.state!=='matched')break;}}
    finally{this.busy=false;}
  }
  receipt(){return this.items.map(c=>({id:c.attempt!.id,name:c.attempt!.name,slug:c.attempt!.slug,organization:this.organization,day:this.day,state:c.phase,failure:c.failure,matchedVersion:c.result?.matchedVersion??null}));}
}
export function unchangedInventory(a:unknown,b:unknown){if(!sameJson(a,b))invalid('Schedules changed while exporting. No partial file was produced. Retry the export.');}
