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
export function documentEmail({name,edition,documents='call_sheet',url}:{name:string;edition?:number;documents?:DocumentSelection;url:string}){
 const label=documents==='both'?'Schedule and call sheet':documentLabels[documents]??documentLabels.call_sheet;
 const description=label.toLowerCase();
 const version=edition===undefined?'':`Version ${edition} · `;
 return {
  subject:`${name} — ${label} | Roseland Pictures`,
  text:`Hello,\n\nPlease review the ${description} for ${name} using the link below.\n\nView ${description}\n${url}\n\nAfter reviewing, please select “Confirm received” on the document page so our production team knows you have the details.\n\nIf you have any questions or need to flag a change, please contact your Roseland Pictures production contact.\n\nThank you,\nRoseland Pictures\nProduction Team\n\n${version}No sign-in required. You can print or save a PDF from the document page.`,
 };
}
export const deliveryStateLabel=(state:string)=>state==='accepted'?'Sent to mail server':state==='not_sent'?'Not sent':'Check delivery';
