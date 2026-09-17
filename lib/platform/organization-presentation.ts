import type {SupabaseClient} from '@supabase/supabase-js';
import type {CmsConfig} from '../api/cms.ts';
import {CMS_COLORS,CMS_ACTION_STYLES} from '../constants.ts';
import {parseInvitationId} from './contracts.ts';
import {createScheduleLibraryRepository} from './schedule-library.ts';
export const PRESENTATION_LABELS = [
 ['appTitle','Page title','Production Schedule'],['hdrTitle','Header subtitle','Production Schedule'],
 ['colAction','Column: Action','Action'],['colLocation','Column: Location','Location'],['colDesc','Column: Description','Description'],['colNotes','Column: Notes','Notes'],['colTimeIn','Column: Time In','Time In'],['colDuration','Column: Duration','Duration'],['colTimeOut','Column: Time Out','Time Out'],['colDone','Column: Done','Done'],
 ['metaTown','Town / Location label','Town / Location'],['metaDate','Date label','Date'],['metaCall','Call Time label','Call Time'],['metaProd','Producer label','Producer'],['metaDir','Director label','Director'],['metaDp','Camera label','Camera'],['btnAddRow','Add Row button','+ Add Row'],
] as const;
const fail=():never=>{throw Error('Configuration is invalid. Review names, colors, labels and the embedded logo; nothing was removed.');};
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export function validatePresentation(value:unknown):CmsConfig{
 if(!obj(value)||JSON.stringify(value).length>3000000||Object.keys(value).some(k=>!['actions','actionStyles','colors','labels','logo'].includes(k)))fail();
 const v=value as Record<string,unknown>,classes=CMS_ACTION_STYLES.map(s=>s.cls as string);
 if(v.actions!==undefined){if(!Array.isArray(v.actions)||v.actions.length>100)fail();const names=new Set();for(const a of v.actions as unknown[]){if(!obj(a)||Object.keys(a).some(k=>!['name','color'].includes(k))||typeof a.name!=='string'||!a.name.trim()||a.name.length>100||/[\x00-\x1f\x7f]/.test(a.name)||['other','sunrise','sunset'].includes(a.name.trim().toLowerCase())||names.has(a.name.trim().toLowerCase())||typeof a.color!=='string'||(a.color!==''&&!classes.includes(a.color)))fail();names.add((a as {name:string}).name.trim().toLowerCase());}}
 for(const key of ['colors','labels','actionStyles'])if(v[key]!==undefined){if(!obj(v[key]))fail();for(const [k,x] of Object.entries(v[key] as Record<string,unknown>)){
  if(key==='colors'&&(!CMS_COLORS.some(c=>c.key===k)||!color(x)))fail();
  if(key==='labels'&&(!PRESENTATION_LABELS.some(l=>l[0]===k)||typeof x!=='string'||x.length>160||/[\x00-\x1f\x7f]/.test(x)))fail();
  if(key==='actionStyles'&&(!classes.includes(k)||!obj(x)||Object.keys(x).some(k=>!['bg','text'].includes(k))||!color(x.bg)||!color(x.text)))fail();
 }}
 if(v.logo!==undefined&&v.logo!==null&&(typeof v.logo!=='string'||v.logo.length>2800000||!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(v.logo)))fail();
 return structuredClone(v) as CmsConfig;
}
export interface PresentationRecord {organization_id:string;version:number;config:CmsConfig;can_manage:boolean}
export interface PresentationAttempt {actor:string;organization:string;request:string;version:number;config:CmsConfig}
export function capturePresentation(v:PresentationAttempt){[v.actor,v.organization,v.request].forEach(parseInvitationId);if(!Number.isSafeInteger(v.version)||v.version<0)fail();const a={...v,config:validatePresentation(v.config)};const freeze=(x:unknown)=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(a);return a;}
export function createPresentationRepository(client:SupabaseClient){const {rpc}=createScheduleLibraryRepository(client);return {
 async read(actor:string,organization:string):Promise<PresentationRecord>{const r=await rpc(actor,'read_organization_presentation',{target_organization_id:parseInvitationId(organization)});if(r?.organization_id!==organization||!Number.isSafeInteger(r.version)||r.version<0||typeof r.can_manage!=='boolean')fail();return {...r,config:validatePresentation(r.config)};},
 async save(a:PresentationAttempt){const r=await rpc(a.actor,'save_organization_presentation',{target_organization_id:a.organization,request_id:a.request,expected_version:a.version,next_config:a.config});if(r?.confirmed!==true||r.organization_id!==a.organization||r.request_id!==a.request||r.version!==a.version+1)throw Error('The exact settings save was not confirmed. Retry the retained request.');return r;}
};}
