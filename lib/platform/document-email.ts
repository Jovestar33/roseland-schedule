export type DocumentSelection='schedule'|'call_sheet'|'both';
export type EmailMember={name:string;email:string};
export const documentLabels:Record<DocumentSelection,string>={schedule:'Schedule',call_sheet:'Call sheet',both:'Schedule & call sheet'};
export function normalizeEmailMembers(input:EmailMember[]):EmailMember[]{
 if(!Array.isArray(input)||input.length<1||input.length>100)throw Error('Choose between 1 and 100 recipients.');
 const seen=new Set<string>();
 return input.map(person=>{
  const name=typeof person.name==='string'?person.name.trim():'',email=typeof person.email==='string'?person.email.trim().toLowerCase():'';
  if(name.length>160||email.length>254||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email))throw Error('Check the email address for '+(name||'each recipient')+'.');
  if(seen.has(email))throw Error('Each email address should appear only once.');seen.add(email);return{name,email};
 }).sort((a,b)=>a.email.localeCompare(b.email));
}
export function documentEmail({name,edition,documents='call_sheet',url}:{name:string;edition:number;documents?:DocumentSelection;url:string}){
 const label=documentLabels[documents]??documentLabels.call_sheet;
 return {subject:`${label}: ${name} — Version ${edition}`,text:`Your ${label.toLowerCase()} ${documents==='both'?'are':'is'} ready.\n\n${name}\nVersion ${edition}\n\nView and print ${documents==='both'?'both documents':'the '+label.toLowerCase()}:\n${url}\n\nNo sign-in is needed. You can print or save a PDF from the page. Please select “Confirm received” after reviewing.\n\nRoseland Pictures`};
}
export const deliveryStateLabel=(state:string)=>state==='accepted'?'Sent to mail server':state==='not_sent'?'Not sent':'Check delivery';
