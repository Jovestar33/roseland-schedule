'use strict';
// These new-app details have no legacy editor. Keep them exclusively in Supabase.
const callSheetFields=['productionOffice','hospitalPhone','hospitalNotes','advanceSchedule'];
function split(value){
 const document=structuredClone(value),extensions={};
 if(Object.hasOwn(document.meta,'productionContacts')){extensions.productionContacts=document.meta.productionContacts;delete document.meta.productionContacts;}
 if(document.meta.callsheet){
  const fields={};for(const key of callSheetFields)if(Object.hasOwn(document.meta.callsheet,key)){fields[key]=document.meta.callsheet[key];delete document.meta.callsheet[key];}
  if(Object.keys(fields).length){extensions.callsheet=fields;if(!Object.keys(document.meta.callsheet).length)delete document.meta.callsheet;}
 }
 return{document,...(Object.keys(extensions).length?{extensions}:{})};
}
function restore(value,extensions){
 const next=structuredClone(value);
 if(extensions&&Object.hasOwn(extensions,'productionContacts'))next.meta.productionContacts=structuredClone(extensions.productionContacts);
 if(extensions?.callsheet)next.meta.callsheet={...(next.meta.callsheet??{}),...structuredClone(extensions.callsheet)};
 return next;
}
module.exports={split,restore};
