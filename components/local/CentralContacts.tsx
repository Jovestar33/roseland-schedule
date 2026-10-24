'use client';
import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {ModalCloseContext} from '@/components/modals/Modal';
import {ArrowLeft,ArrowRight,ChevronDown,Mail,Phone,RefreshCw,Search,SlidersHorizontal,Users} from 'lucide-react';
import {useLocalWorkspace} from './LocalWorkspaceContext';
import {contactTypeLabels} from './ProductionContacts';
import type {DirectoryPerson} from '@/lib/platform/contact-directory';
import type {ProductionContactType} from '@/lib/types';
type Entry={key:string;cursor:string;id:string|null;contact:DirectoryPerson;version:number|null;scope:'organization'|'production'|'phase'|'schedule';production_id:string|null;production:string;phase_id:string|null;phase:string;schedule_id:string|null;schedule:string;can_manage:boolean;used_in:{id:string;name:string;production_id:string;phase_id:string|null}[]};
type Production={id:string;name:string;can_manage:boolean;phases:{id:string;name:string}[]};
type Page={entries:Entry[];productions:Production[];can_create_organization:boolean};
type Draft={person:DirectoryPerson;production:string;phase:string;version:number|null};
export default function CentralContacts({onBack,onState,embedded=false,closeNotice=false}:{onBack:()=>void;onState?:(dirty:boolean,busy:boolean,editing?:boolean)=>void;embedded?:boolean;closeNotice?:boolean}){
 const closeModal=useContext(ModalCloseContext);
 const workspace=useLocalWorkspace(),org=workspace?.organization?.id,actor=workspace?.session?.user.id;
 const [data,setData]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[production,setProduction]=useState(''),[phase,setPhase]=useState(''),[type,setType]=useState(''),[scope,setScope]=useState(''),[sort,setSort]=useState('name');
 const [selected,setSelected]=useState<Entry|null>(null),[draft,setDraft]=useState<Draft|null>(null),[removing,setRemoving]=useState(false);
 const [search,setSearch]=useState('');
 const [filtersOpen,setFiltersOpen]=useState(false),[profileTab,setProfileTab]=useState<'details'|'schedules'>('details');
 const [saving,setSaving]=useState(false);
 const initialDraft=useRef<Draft|null>(null),heading=useRef<HTMLHeadingElement>(null),searchInput=useRef<HTMLInputElement>(null),listScroll=useRef(0);
 const editing=!!draft,selectedKey=selected?.key;
 const draftChanged=!!draft&&JSON.stringify(draft)!==JSON.stringify(initialDraft.current);
 useEffect(()=>{if(editing||selectedKey){const body=heading.current?.closest('.mbody');if(body)body.scrollTop=0;heading.current?.focus({preventScroll:true});}},[editing,selectedKey]);
 useEffect(()=>{if(closeNotice){const body=heading.current?.closest('.mbody');if(body)body.scrollTop=0;}},[closeNotice]);
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query),250);return()=>clearTimeout(timer);},[query]);
 const [more,setMore]=useState(false),[cursor,setCursor]=useState('');
 const ticket=useRef(0),working=useRef(false),context=useRef({org,actor,active:workspace?.active});context.current={org,actor,active:workspace?.active};
 const enabled=!!org&&!!actor&&!!workspace?.active&&!workspace.authNeeded&&!workspace.readOnly;
 const current=useCallback(()=>context.current.org===org&&context.current.actor===actor&&context.current.active,[org,actor]);
 useEffect(()=>{onState?.(draftChanged,saving,editing);return()=>onState?.(false,false,false);},[draftChanged,saving,editing,onState]);
 const load=useCallback(async(append=false,after='')=>{
  if(!workspace?.client||!org||!actor||!workspace.active||workspace.authNeeded)return;
  const n=++ticket.current;setBusy(true);setError('');
  try{
   const result=await workspace.client.rpc('organization_contact_directory',{target_organization_id:org,after_key:after,search_text:search,production_filter:production||null,phase_filter:phase||null,type_filter:type,scope_filter:scope,sort_by:sort});
   if(result.error)throw Error('Contacts could not be loaded. Refresh or sign in again.');
   const page=result.data as Page;
   if(!page||!Array.isArray(page.entries)||!Array.isArray(page.productions))throw Error('Contacts could not be verified.');
   if(!current()||n!==ticket.current)return;
   setMore(page.entries.length>100);const entries=page.entries.slice(0,100);setCursor(entries.at(-1)?.cursor??'');
   setData(before=>({...page,entries:append?[...(before?.entries??[]),...entries]:entries}));
  }catch(e){if(current()&&n===ticket.current)setError((e as Error).message);}
  finally{if(current()&&n===ticket.current)setBusy(false);}
 },[workspace?.client,workspace?.active,workspace?.authNeeded,org,actor,current,search,production,phase,type,scope,sort]);
 useEffect(()=>{const requests=ticket;setData(null);setDraft(null);setSelected(null);setRemoving(false);setMessage('');working.current=false;setBusy(false);setSaving(false);initialDraft.current=null;return()=>{requests.current++;};},[org,actor]);
 useEffect(()=>{const requests=ticket;if(!editing)void load();return()=>{requests.current++;};},[load,editing]);
 const filtered=data?.entries??[];
 async function save(archive=false){
  if(!workspace||!org||!enabled||working.current||!draft||!draft.person.name.trim())return;
  working.current=true;setBusy(true);setSaving(true);setError('');const n=++ticket.current;
  try{const person=Object.fromEntries(Object.entries(draft.person).map(([k,v])=>[k,typeof v==='string'?v.trim():v]));const result=await workspace.client.rpc('save_organization_contact',{target_organization_id:org,target_production_id:draft.production||null,target_phase_id:draft.phase||null,target_contact_id:person.id,next_contact:archive?null:person,expected_version:draft.version,archive_contact:archive});
   if(result.error)throw Error(result.error.code==='PT409'?'This contact changed. Cancel and refresh before editing again.':'The contact could not be saved. Your entries are still here.');if(!result.data||result.data.id!==person.id||!Number.isSafeInteger(result.data.version))throw Error('We couldn’t confirm the save. Your entries are still here; try Save contact again.');
   if(!current()||n!==ticket.current)return;setDraft(null);setSelected(null);setRemoving(false);setMessage(archive?'Contact archived. Saved schedules are unchanged.':'Contact saved. Existing call sheets keep their saved details.');
  }catch(e){if(current()&&n===ticket.current)setError((e as Error).message);}finally{working.current=false;if(current()){setBusy(false);setSaving(false);}}
 }
 function startDraft(next:Draft){initialDraft.current=structuredClone(next);setDraft(next);setRemoving(false);setError('');setMessage('');}
 function edit(entry:Entry){startDraft({person:{...entry.contact},production:entry.production_id??'',phase:entry.phase_id??'',version:entry.version});}
 function add(){const prod=data?.can_create_organization?'':data?.productions.find(p=>p.can_manage)?.id;if(prod===undefined)return;setSelected(null);startDraft({person:{id:crypto.randomUUID(),type:'crew',name:'',role:'',phone:'',email:'',company:'',department:''},production:prod,phase:'',version:null});}
 function patch(key:keyof DirectoryPerson,value:string){setDraft(d=>d?{...d,person:{...d.person,[key]:value}}:d);}
 function cancelDraft(){setDraft(null);setRemoving(false);setError('');requestAnimationFrame(()=>{if(selected)heading.current?.focus({preventScroll:true});else searchInput.current?.focus({preventScroll:true});});}
 function closeContacts(afterClose?:()=>void){if(embedded&&closeModal)closeModal(afterClose);else{onBack();afterClose?.();}}
 function back(){if(draft)cancelDraft();else if(selected){setSelected(null);requestAnimationFrame(()=>{const body=heading.current?.closest('.mbody');if(body)body.scrollTop=listScroll.current;searchInput.current?.focus({preventScroll:true});});}else closeContacts();}
 function view(entry:Entry){listScroll.current=heading.current?.closest('.mbody')?.scrollTop??0;setProfileTab('details');setSelected(entry);setError('');setMessage('');}
 function clearFilters(){setQuery('');setSearch('');setProduction('');setPhase('');setType('');setScope('');}
 const extraCount=[phase,type,scope].filter(Boolean).length,hasFilters=!!(query||production||phase||type||scope);
 const selectedProduction=data?.productions.find(p=>p.id===draft?.production);
 const category=(value:ProductionContactType)=>({crew:'Crew',cast:'Cast / participants',client:'Client',location:'Location',other:'Other'})[value];
 const title=draft?(draft.version?'Edit contact':'New contact'):selected?selected.contact.name:'Contacts';
 const field=(key:'name'|'company'|'role'|'department'|'phone'|'email')=><label key={key}>{({name:'Name',company:'Company',role:'Role / title',department:'Department',phone:'Phone',email:'Email'})[key]}{key==='name'&&<span className="pc-visually-hidden"> (required)</span>}<input required={key==='name'} autoComplete={key==='name'?'name':key==='company'?'organization':key==='phone'?'tel':key==='email'?'email':'off'} type={key==='email'?'email':key==='phone'?'tel':'text'} maxLength={key==='email'?254:160} value={draft?.person[key]??''} onChange={e=>patch(key,e.target.value)}/></label>;
 return <section className="contacts-home">
  {(draft||selected||!embedded)&&<button className="contacts-back" disabled={saving} onClick={back}><ArrowLeft size={16}/>Back</button>}
  <header className="contacts-home-heading">
   <div>
    <h2 ref={heading} tabIndex={-1} aria-hidden={!draft&&!selected&&embedded?true:undefined} className={!draft&&!selected&&embedded?'pc-visually-hidden':''}>{title}</h2>
    {!draft&&!selected&&<p>Your people, across every production.</p>}
    {draft&&<p>{draft.version?'Update this shared contact. Saved schedules keep their existing details.':'Add a reusable contact for your organization or a production.'}</p>}
    {selected&&!draft&&<><span className="contacts-badge">{category(selected.contact.type)}</span>{(selected.contact.role||selected.contact.company)&&<p>{[selected.contact.role,selected.contact.company].filter(Boolean).join(' · ')}</p>}</>}
   </div>
   {!draft&&!selected&&<button className="btn btn-pink" disabled={!enabled||busy||!data||!(data.can_create_organization||data.productions.some(p=>p.can_manage))} onClick={add}>Add contact</button>}
  </header>
  {closeNotice&&(draftChanged||saving)&&<p className="contacts-notice" role="alert">{saving?'Your contact is saving. Please wait a moment.':'You have unsaved changes. Save your contact, or choose Cancel to discard them.'}</p>}
  {error&&<p className="contacts-notice" role="alert">{error}</p>}{message&&<p className="contacts-notice" role="status">{message}</p>}
  {draft?<form className="contacts-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={saving||!enabled}>
    <legend>Contact details</legend>
    <div className="contacts-fields">{field('name')}<label>Contact type<select value={draft.person.type} onChange={e=>patch('type',e.target.value as ProductionContactType)}>{Object.entries(contactTypeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{field('role')}{field('company')}{field('department')}</div>
   </fieldset>
   <fieldset disabled={saving||!enabled}>
    <legend>Get in touch</legend><div className="contacts-fields">{field('phone')}{field('email')}</div>
   </fieldset>
   <fieldset disabled={saving||!enabled}>
    <legend>Where to use this contact</legend>
    {draft.version!==null?<p className="contacts-placement">{draft.production?selectedProduction?.name??'Production':workspace?.organization?.name}{draft.phase&&<> · {selectedProduction?.phases.find(p=>p.id===draft.phase)?.name??'Phase'}</>}</p>:<div className="contacts-fields"><label>Organization or production<select value={draft.production} onChange={e=>setDraft(d=>d?{...d,production:e.target.value,phase:''}:d)}>{data?.can_create_organization&&<option value="">Organization · {workspace?.organization?.name}</option>}{data?.productions.filter(p=>p.can_manage).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>{draft.production&&<label>Phase<select value={draft.phase} onChange={e=>setDraft(d=>d?{...d,phase:e.target.value}:d)}><option value="">Whole production</option>{selectedProduction?.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</div>}
    <p className="contacts-helper">{draft.phase?'Available to schedules in this phase.':draft.production?'Available to all schedules in this production.':'Available across your organization.'} Individual calls stay on each schedule.</p>
   </fieldset>
   {draft.version!==null&&<div className="contacts-archive">{removing?<div className="contacts-notice"><p>Archive this contact? Their details will stay on existing schedules.</p><div className="contacts-actions"><button type="button" className="btn btn-light" disabled={saving} onClick={()=>setRemoving(false)}>Cancel</button><button type="button" className="btn btn-pink" disabled={saving||!enabled} onClick={()=>void save(true)}>Archive contact</button></div></div>:<button type="button" className="contacts-text-button" disabled={saving||!enabled} onClick={()=>setRemoving(true)}>Archive contact…</button>}</div>}
   <div className="contacts-form-actions"><button type="button" className="btn btn-light" disabled={saving} onClick={cancelDraft}>Cancel</button><button className="btn btn-pink" disabled={!enabled||saving||!draft.person.name.trim()||removing}>{saving?'Saving…':'Save contact'}</button></div>
  </form>:selected?<article className="contacts-profile">
   <nav className="contacts-subnav" aria-label="Contact sections"><button aria-current={profileTab==='details'?'page':undefined} onClick={()=>setProfileTab('details')}>Details</button><button aria-current={profileTab==='schedules'?'page':undefined} onClick={()=>setProfileTab('schedules')}>Schedules <span>{selected.used_in.length}</span></button></nav>
   {profileTab==='details'?<div className="contacts-profile-details">
    <dl>{[['Company',selected.contact.company],['Role / title',selected.contact.role],['Department',selected.contact.department],['Phone',selected.contact.phone],['Email',selected.contact.email]].filter(([,v])=>v).map(([label,v])=><div key={label}><dt>{label}</dt><dd>{label==='Email'?<a href={`mailto:${v}`}><Mail size={15}/><span>{v}</span></a>:label==='Phone'?<span className="contacts-phones">{v!.split(/\s*[/;\n]\s*/).filter(Boolean).map((phone,i)=>/^[+\d][\d ().+-]*$/.test(phone)?<a key={i} href={`tel:${phone.replace(/[^+\d]/g,'')}`}><Phone size={15}/><span>{phone}</span></a>:<span key={i}>{phone}</span>)}</span>:v}</dd></div>)}</dl>
    <div className="contacts-scope"><span className="contacts-meta-label">Available in</span><strong>{selected.scope==='schedule'?selected.schedule:selected.scope==='organization'?workspace?.organization?.name:selected.production}</strong>{selected.phase&&selected.scope!=='schedule'&&<span>{selected.phase}</span>}<p>{selected.scope==='schedule'?'This contact belongs to this schedule. Open Schedules to edit their details and individual calls.':'Shared contact. Changes here apply when this contact is added or refreshed on a schedule.'}</p></div>
    {selected.can_manage&&<button className="btn btn-pink" disabled={!enabled} onClick={()=>edit(selected)}>Edit contact</button>}
   </div>:<section className="contacts-assignments" aria-label="Schedule assignments"><p className="contacts-helper">Open a schedule to view this person’s details and individual calls.</p>{selected.used_in.length?<ul>{selected.used_in.map(s=><li key={s.id}><button onClick={()=>closeContacts(()=>workspace?.openSchedule(org!,s.id))}><span><strong>{s.name}</strong><small>{data?.productions.find(p=>p.id===s.production_id)?.name??selected.production}</small></span><ArrowRight size={18}/></button></li>)}</ul>:<div className="contacts-empty"><Users size={24}/><h3>No schedule assignments yet</h3><p>Add this person from the contact selector in a schedule.</p></div>}</section>}
  </article>:<>
   <div className="contacts-searchbar"><label><span className="pc-visually-hidden">Search contacts</span><Search size={18}/><input ref={searchInput} type="search" placeholder="Search name, company or role…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="contacts-primary-filters"><label>Production<select value={production} onChange={e=>{setProduction(e.target.value);setPhase('');}}><option value="">All productions</option>{data?.productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name</option><option value="production">Production</option><option value="role">Role</option><option value="type">Contact type</option></select></label></div>
   <div className="contacts-filter-actions"><button className="contacts-filter-toggle" aria-expanded={filtersOpen} aria-controls="contacts-extra-filters" onClick={()=>setFiltersOpen(v=>!v)}><SlidersHorizontal size={16}/>More filters{extraCount>0&&<span className="contacts-filter-count">{extraCount}</span>}<ChevronDown size={15}/></button>{hasFilters&&<button className="contacts-text-button" onClick={clearFilters}>Clear filters</button>}</div>
   <div className="contacts-extra-filters" id="contacts-extra-filters" hidden={!filtersOpen}><label>Phase<select value={phase} disabled={!production} onChange={e=>setPhase(e.target.value)}><option value="">{production?'All phases':'Choose a production first'}</option>{data?.productions.find(p=>p.id===production)?.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Contact type<select value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{Object.entries(contactTypeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Contact level<select value={scope} onChange={e=>setScope(e.target.value)}><option value="">All levels</option>{['organization','production','phase','schedule'].map(s=><option value={s} key={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label></div>
   {!filtersOpen&&extraCount>0&&<p className="contacts-active-filters">{[phase&&data?.productions.find(p=>p.id===production)?.phases.find(p=>p.id===phase)?.name,type&&category(type as ProductionContactType),scope&&`${scope[0].toUpperCase()+scope.slice(1)} contacts`].filter(Boolean).join(' · ')}</p>}
   <div className="contacts-results-heading"><p role="status">{busy?'Updating contacts…':!data&&error?'Contacts unavailable':`${filtered.length} contact${filtered.length===1?'':'s'}${more?' shown':''}`}</p><button className="contacts-icon-button" aria-label="Refresh contacts" title="Refresh contacts" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/></button></div>
   <div className="contacts-list" aria-busy={busy}>{filtered.map(entry=><button className="contacts-list-row" key={entry.key} onClick={()=>view(entry)}><span className="contacts-person"><strong>{entry.contact.name}</strong><small>{[entry.contact.role,entry.contact.company].filter(Boolean).join(' · ')||category(entry.contact.type)}</small></span><span className="contacts-list-context"><span className="contacts-badge">{category(entry.contact.type)}</span><small>{entry.production||'Organization'}{entry.scope==='schedule'?` · ${entry.schedule}`:entry.phase?` · ${entry.phase}`:''}</small></span><ArrowRight size={17}/></button>)}</div>
   {!busy&&data&&!filtered.length&&<div className="contacts-empty"><Users size={26}/><h3>{hasFilters?'No matching contacts':'Your contacts start here'}</h3><p>{hasFilters?'Try another name or clear your filters.':'Add a contact to use across your productions.'}</p>{hasFilters&&<button className="btn btn-light" onClick={clearFilters}>Clear filters</button>}</div>}
   {more&&<button className="btn btn-light contacts-load-more" disabled={busy} onClick={()=>void load(true,cursor)}>Load more contacts</button>}
  </>}
 </section>;
}
