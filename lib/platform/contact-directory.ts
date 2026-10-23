import type {ProductionContact} from '../types.ts';
import type {ScheduleRpcClient} from './schedule-repository.ts';
export type ContactScope='organization'|'production'|'phase';
export type DirectoryPerson=Pick<ProductionContact,'id'|'type'|'name'|'role'|'phone'|'email'|'department'>;
export interface DirectoryEntry {id:string;scope:ContactScope;label:string;version:number;contact:DirectoryPerson;canManage:boolean}
export interface ContactDirectory {entries:DirectoryEntry[];scopes:{scope:ContactScope;label:string;canManage:boolean}[]}
export function directoryPerson(c:ProductionContact):DirectoryPerson {return {id:c.id,type:c.type,name:c.name.trim(),role:c.role.trim(),phone:c.phone.trim(),email:c.email.trim(),department:c.department??''};}
export function assignDirectoryContact(entry:DirectoryEntry,current?:ProductionContact):ProductionContact {
 return {...entry.contact,directoryScope:entry.scope,directoryLabel:entry.label,callTime:current?.callTime??'',reportTo:current?.reportTo??'',notes:current?.notes??''};
}
export function createContactDirectoryRepository(client:ScheduleRpcClient){
 async function invoke(name:string,args:Record<string,unknown>){
  const {data,error}=await client.rpc(name,args);
  if(error)throw new Error(error.code==='PT409'?'This contact changed. Refresh the directory before trying again.':error.code==='PT404'||error.code==='42501'?'You no longer have access to this contact.':error.code==='PT401'?'Sign in again to use shared contacts.':'The contact request could not be confirmed. Refresh before retrying.');
  return data;
 }
 return {
  async list(schedule:string):Promise<ContactDirectory>{const data=await invoke('schedule_contact_directory',{target_schedule_id:schedule}) as ContactDirectory;if(!data||!Array.isArray(data.entries)||!Array.isArray(data.scopes))throw new Error('Contacts could not be loaded.');return data;},
  async save(schedule:string,scope:ContactScope,contact:DirectoryPerson,version:number|null):Promise<DirectoryEntry>{const data=await invoke('save_directory_contact',{target_schedule_id:schedule,target_scope:scope,target_contact_id:contact.id,next_contact:contact,expected_version:version,archive_contact:false}) as DirectoryEntry;if(!data||data.id!==contact.id||data.scope!==scope||!Number.isSafeInteger(data.version))throw new Error('Contact save could not be confirmed. Refresh before retrying.');return data;},
  async archive(schedule:string,entry:DirectoryEntry){await invoke('save_directory_contact',{target_schedule_id:schedule,target_scope:entry.scope,target_contact_id:entry.id,next_contact:null,expected_version:entry.version,archive_contact:true});}
 };
}
