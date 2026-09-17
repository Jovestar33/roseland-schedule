/** Separate records prevent two tabs from overwriting each other's recovery data. */
export interface RequestJournalStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;readonly length?:number;key?(index:number):string|null}
export function journalEntries(storage:RequestJournalStorage,prefix:string):{key:string;raw:string}[]{
 const keys=[prefix];if(storage.key&&typeof storage.length==='number')for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix+':'))keys.push(k);}
 return [...new Set(keys)].sort().flatMap(key=>{const raw=storage.getItem(key);return raw===null?[]:[{key,raw}];});
}
export function journalWrite(storage:RequestJournalStorage,prefix:string,id:string,raw:string,legacyMatches?:(raw:string)=>boolean){
 // Minimal in-memory adapters retain the original interface; browser Storage is enumerable.
 const key=storage.key?prefix+':'+id:prefix;storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('Request recovery could not be saved. No new request was sent.');
 if(key!==prefix&&legacyMatches){const legacy=storage.getItem(prefix);if(legacy!==null&&legacyMatches(legacy))storage.removeItem(prefix);}
}
export function journalClear(storage:RequestJournalStorage,prefix:string,id:string,matches:(raw:string)=>boolean){for(const key of [prefix,prefix+':'+id]){const raw=storage.getItem(key);if(raw!==null&&matches(raw))storage.removeItem(key);}}
