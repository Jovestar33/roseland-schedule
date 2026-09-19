'use client';
import {useEffect,useRef,useState} from 'react';
import TemplateRowsPreview from './TemplateRowsPreview';
import {LS_TEMPLATES_KEY} from '@/lib/constants';
import {parseBrowserTemplates,type BrowserTemplate} from '@/lib/platform/browser-templates';
import {captureTemplateAttempt,templateDraftRows,type TemplateAttempt,type TemplateProduction} from '@/lib/platform/schedule-templates';
interface Props {actor:string;organization:string;productions:TemplateProduction[];disabled:boolean;onPrepare:(a:TemplateAttempt)=>void}
export default function LocalBrowserTemplates({actor,organization,productions,disabled,onPrepare}:Props){
 const readTicket=useRef(0);useEffect(()=>()=>{readTicket.current++;},[]);
 const [items,setItems]=useState<BrowserTemplate[]>([]),[raw,setRaw]=useState<string|null>(null),[origin,setOrigin]=useState(''),[message,setMessage]=useState('');
 const [selected,setSelected]=useState<number|null>(null),[name,setName]=useState(''),[destination,setDestination]=useState(''),[claimed,setClaimed]=useState(false);
 function inspect(contents:string,label:string){setRaw(contents);setOrigin(label);setSelected(null);setClaimed(false);setDestination('');setItems([]);try{const found=parseBrowserTemplates(contents);setItems(found);setMessage(found.length?`${found.length} source templates found. Import results appear above; original source data stays unchanged.`:'No browser templates found.');}catch(e){setMessage(e instanceof Error?e.message:'Could not inspect templates. Original data is retained.');}}
 const chosen=selected===null?null:items[selected];
 return <details className="browser-template-import"><summary>Browser templates — discover, export or import</summary>
  <p>Browser data has no organization ownership attached. Import one reviewed template into a production you choose. Existing templates are never overwritten; original browser data and files are retained.</p>
  <fieldset disabled={disabled} style={{border:0,padding:0}}>
   <button className="btn btn-light" onClick={()=>{readTicket.current++;try{inspect(localStorage.getItem(LS_TEMPLATES_KEY)??'{}','This browser');}catch{setMessage('Browser storage is unavailable. Nothing was changed.');}}}>Find templates in this browser</button>
   <label>Import browser-template JSON<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0],ticket=++readTicket.current;e.target.value='';if(!file)return;if(file.size>20_000_000){setMessage('File exceeds 20 MB. Nothing was imported.');return;}try{const raw=await file.text();if(ticket===readTicket.current)inspect(raw,file.name);}catch{setMessage('File could not be read. Nothing was imported.');}}}/></label>
   {raw!==null&&<button className="btn btn-light" onClick={()=>{const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='Browser-template-originals.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export untouched browser-template source</button>}
   <p role="status">{message}</p>
   {items.length>0&&<><p>Source: {origin}</p><label>Browser template to review<select value={selected??''} onChange={e=>{const n=Number(e.target.value);if(e.target.value===''){setSelected(null);return;}setSelected(n);setName(items[n].name);setClaimed(false);}}><option value="">Choose a template</option>{items.map((t,i)=><option key={i} value={i}>{t.name} · {t.rows.length} rows</option>)}</select></label></>}
   {chosen&&<><details><summary>Review complete original rows, including contacts and notes</summary><TemplateRowsPreview rows={chosen.rows}/></details>
    <label>Import destination production<select value={destination} onChange={e=>{setDestination(e.target.value);setClaimed(false);}}><option value="">Choose a production explicitly</option>{productions.filter(p=>p.can_manage).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Imported template name<input value={name} maxLength={150} onChange={e=>setName(e.target.value)}/></label>
    <label className="template-ownership"><input type="checkbox" checked={claimed} onChange={e=>setClaimed(e.target.checked)}/>I have reviewed this template and may assign its content to the selected production.</label>
    <p>Generated sun rows are omitted from the imported template. The complete original remains in its source. Organization publication requires a separate authorized review.</p>
    <button className="btn btn-primary" disabled={!destination||!claimed||!name.trim()} onClick={()=>{try{onPrepare(captureTemplateAttempt({actor,organization,production:destination,id:crypto.randomUUID(),request:crypto.randomUUID(),version:0,operation:'import',name:name.trim(),rows:null,source:null,sourceVersion:null,browserSource:chosen,ownershipConfirmed:claimed,previewName:name.trim(),previewRows:templateDraftRows(chosen.rows)}));}catch(e){setMessage(e instanceof Error?e.message:'Import review could not be prepared.');}}}>Review production-only import</button>
   </>}
  </fieldset>
 </details>;
}
