'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { ScheduleRepositoryError } from '@/lib/platform/schedule-repository';
import { createWorkspaceRepository, type WorkspaceOrganization } from '@/lib/platform/workspace-repository';
import { parseWorkspaceLocation, workspaceHref, WorkspaceIdentity, type WorkspaceLocation, type WorkspaceScreen } from '@/lib/platform/workspace-navigation';
import { LocalWorkspaceContext, type WorkspacePanelState, type WorkspaceScheduleRequest } from '@/components/local/LocalWorkspaceContext';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import LocalScheduleClient from '../local-schedule/LocalScheduleClient';
import LocalInvitationsClient from '../local-invitations/LocalInvitationsClient';
import LocalAcceptanceClient from '../local-accept-invitation/LocalAcceptanceClient';
import styles from './workspace.module.css';
import LocalSchedulePermissions from '@/components/local/LocalSchedulePermissions';
import LocalLifecycleClient from './LocalLifecycleClient';
import LocalProvisioningClient from './LocalProvisioningClient';

const initial:WorkspaceLocation={screen:'schedule',organization:null};
export default function LocalWorkspaceClient({config}:{config:LocalEditorConfig}){
  const expired=useRef<(token:string|null)=>void>(()=>{});
  const [client]=useState(()=>createClient(config.supabaseUrl,config.anonymousKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{async fetch(input,init){
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(url.origin!==config.supabaseUrl)throw new Error('Local request required');
      const response=await fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(response.status===401 && url.pathname.startsWith('/rest/v1/'))expired.current(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization'));return response;
    }},
  }));
  const [repository]=useState(()=>createWorkspaceRepository(client)),[identity]=useState(()=>new WorkspaceIdentity());
  const [session,setSession]=useState<Session|null>(null),sessionRef=useRef<Session|null>(null);
  const [authNeeded,setAuthNeeded]=useState(false),[accountEpoch,setAccountEpoch]=useState(0);
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [location,setLocation]=useState<WorkspaceLocation>(initial),locationRef=useRef(initial);
  const [organizations,setOrganizations]=useState<WorkspaceOrganization[]>([]),[more,setMore]=useState(false);
  const [visited,setVisited]=useState<WorkspaceOrganization[]>([]),[managementPanels,setManagementPanels]=useState<string[]>([]);
  const [scope,setScope]=useState<WorkspaceOrganization|null>(null);
  const [lifecyclePanels,setLifecyclePanels]=useState<string[]>([]),[scheduleRequest,setScheduleRequest]=useState<WorkspaceScheduleRequest|null>(null),scheduleSequence=useRef(0);
  const consumeScheduleRequest=useCallback((sequence:number)=>setScheduleRequest(previous=>previous?.sequence===sequence?null:previous),[]);
  const [panels,setPanels]=useState<Record<string,WorkspacePanelState>>({});
  const [busy,setBusy]=useState(false),busyRef=useRef(false),navigationTicket=useRef(0),directoryTicket=useRef(0);
  const [message,setMessage]=useState('Sign in once to use the local rehearsals.'),[confirmSignOut,setConfirmSignOut]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const dirty=Object.values(panels).some(value=>value.dirty),working=Object.values(panels).some(value=>value.busy);
  const report=useCallback((id:string,value:WorkspacePanelState|null)=>setPanels(previous=>{
    if(value && previous[id]?.dirty===value.dirty && previous[id]?.busy===value.busy)return previous;
    if(!value && !previous[id])return previous;const next={...previous};if(value)next[id]=value;else delete next[id];return next;
  }),[]);
  const requireAuth=useCallback(()=>{setAuthNeeded(true);setMessage('Sign in again with the same account. Retained drafts and requests are still in this workspace.');},[]);
  expired.current=token=>{if(token && token===`Bearer ${sessionRef.current?.access_token}`)requireAuth();};
  const remember=(organization:WorkspaceOrganization)=>setVisited(previous=>[...previous.filter(item=>item.id!==organization.id),organization]);
  async function navigate(next:WorkspaceLocation,push=true){
    const ticket=++navigationTicket.current,generation=identity.capture(),actor=identity.actor;
    if(!actor)return;
    try{
      const organization=next.organization?await repository.scope(actor,next.organization):null;
      if(ticket!==navigationTicket.current||!identity.current(generation))return;
      if(next.organization&&!organization){setMessage('That organization is unavailable to this account. Retained drafts have not been discarded.');next={screen:next.screen==='acceptance'?'acceptance':next.screen==='provisioning'?'provisioning':'schedule',organization:null};}
      if(next.screen==='invitations'&&(!organization||organization.role==='member')){next={...next,screen:'schedule'};setMessage('Invitation management requires an Owner or Admin organization.');}
      if(organization){remember(organization);setOrganizations(previous=>previous.map(item=>item.id===organization.id?organization:item));if(next.screen==='invitations')setManagementPanels(previous=>previous.includes(organization.id)?previous:[...previous,organization.id]);if(next.screen==='lifecycle')setLifecyclePanels(previous=>previous.includes(organization.id)?previous:[...previous,organization.id]);}
      setScope(organization);locationRef.current=next;setLocation(next);
      if(push)history.pushState(null,'',workspaceHref(next));else history.replaceState(null,'',workspaceHref(next));return true;
    }catch(error){
      if(ticket===navigationTicket.current&&identity.current(generation)){
        if(error instanceof ScheduleRepositoryError && error.kind==='unauthenticated')requireAuth();
        else setMessage('Navigation could not finish. Your current workspace and drafts are retained.');
        history.replaceState(null,'',workspaceHref(locationRef.current));
      }
    }
  }
  async function loadOrganizations(append=false){
    const actor=identity.actor,generation=identity.capture(),ticket=++directoryTicket.current;if(!actor)return false;
    const page=await repository.organizations(actor,append?organizations.at(-1)?.id:undefined);
    if(!identity.current(generation)||ticket!==directoryTicket.current)return false;
    setOrganizations(previous=>append?[...previous,...page.items]:page.items);setMore(page.more);return true;
  }
  useEffect(()=>{
    const navigationRequests=navigationTicket,directoryRequests=directoryTicket;
    locationRef.current=parseWorkspaceLocation(window.location.search);setLocation(locationRef.current);
    const subscription=client.auth.onAuthStateChange((_event,next)=>{
      if(sessionRef.current?.access_token!==next?.access_token){navigationRequests.current++;directoryRequests.current++;}
      if(next&&identity.bind(next.user.id)){
        navigationTicket.current++;directoryTicket.current++;useScheduleStore.getState().newSchedule();setPanels({});setVisited([]);setManagementPanels([]);setLifecyclePanels([]);setScheduleRequest(null);setOrganizations([]);setScope(null);setMore(false);setAccountEpoch(identity.generation);
      }
      sessionRef.current=next;setSession(next);
      if(!next&&identity.actor)requireAuth();
    });
    return()=>{navigationRequests.current++;directoryRequests.current++;identity.clear();useScheduleStore.getState().newSchedule();subscription.data.subscription.unsubscribe();};
  },[client,identity,requireAuth]);
  useEffect(()=>{
    if(!session || authNeeded)return;
    void loadOrganizations().then(current=>current?navigate(locationRef.current,false):undefined).catch(()=>setMessage('Organizations could not be refreshed. Your drafts are retained.'));
    // Account epoch and navigation tickets guard asynchronous directory reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.access_token,authNeeded]);
  useEffect(()=>{
    const pop=()=>{void navigate(parseWorkspaceLocation(window.location.search),false);};
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
    // The actor, current location and request identity are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[repository,identity]);
  useEffect(()=>{if(confirmSignOut)dialog.current?.showModal();else dialog.current?.close();},[confirmSignOut]);
  async function login(event:React.FormEvent){
    event.preventDefault();if(busyRef.current||working)return;busyRef.current=true;setBusy(true);
    try{const r=await client.auth.signInWithPassword({email:sessionRef.current?.user.email??email,password});setPassword('');if(r.error||!r.data.session){setMessage('Sign-in failed. Check your fictional account details.');return;}setEmail(r.data.user.email??email);setAuthNeeded(false);setMessage('Signed in. Choose an organization or accept a fictional invitation.');}
    catch{setPassword('');setMessage('Sign-in could not finish. Your drafts are retained.');}finally{busyRef.current=false;setBusy(false);}
  }
  async function signOut(){
    if(busyRef.current||working)return;busyRef.current=true;setBusy(true);
    try{if(sessionRef.current){const r=await client.auth.signOut({scope:'local'});if(r.error)throw new Error('Sign out unavailable');}
      navigationTicket.current++;directoryTicket.current++;identity.clear();useScheduleStore.getState().newSchedule();setAccountEpoch(identity.generation);setPanels({});setVisited([]);setManagementPanels([]);setLifecyclePanels([]);setScheduleRequest(null);setOrganizations([]);setScope(null);setMore(false);setSession(null);sessionRef.current=null;setEmail('');setPassword('');setAuthNeeded(false);setConfirmSignOut(false);setLocation(initial);locationRef.current=initial;history.replaceState(null,'',workspaceHref(initial));setMessage('Signed out. All local drafts and request details cleared.');
    }catch{setMessage('Sign-out could not finish. Your workspace is retained.');}finally{busyRef.current=false;setBusy(false);}
  }
  const active=location.screen;
  const openOrganization=(id:string)=>{void navigate({screen:'schedule',organization:id});};
  const openSchedule=(organization:string,id:string)=>{const generation=identity.capture();void navigate({screen:'schedule',organization}).then(ok=>{if(ok&&identity.current(generation)&&locationRef.current.organization===organization&&locationRef.current.screen==='schedule')setScheduleRequest({id,organization,sequence:++scheduleSequence.current});});};
  const openLifecycle=(organization:string,id:string)=>{const generation=identity.capture();void navigate({screen:'lifecycle',organization}).then(ok=>{if(ok&&identity.current(generation)&&locationRef.current.organization===organization&&locationRef.current.screen==='lifecycle')setScheduleRequest({id,organization,sequence:++scheduleSequence.current,target:'lifecycle'});});};
  const panel=(id:string,organization:WorkspaceOrganization|null,enabled:boolean)=>({client,session,authNeeded,organization,active:enabled,panelId:id,report,requireAuth,openOrganization,openSchedule,openLifecycle,scheduleRequest,consumeScheduleRequest});
  function tab(screen:WorkspaceScreen){if(authNeeded||!session){requireAuth();return;}void navigate({screen,organization:locationRef.current.organization});}
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL WORKSPACE</span><h1>Roseland rehearsals</h1><p>One account, with unfinished work kept in this tab.</p></div><span className={styles.badge}>Fictional data only</span></header>
    <div className={styles.shell}>
      <p className={styles.notice}>Switching local screens keeps drafts and request details. Closing or reloading this page loses them. No email is sent.</p>
      <p role="status" aria-live="polite" className={styles.status}>{message}</p>
      {(!session||authNeeded)&&<form className={styles.login} onSubmit={login} aria-label="Workspace sign in"><h2>{identity.actor?'Sign in again':'Sign in'}</h2><label>Fictional account email<input type="email" required autoComplete="off" readOnly={!!identity.actor} value={session?.user.email??email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="off" value={password} onChange={event=>setPassword(event.target.value)}/></label><button disabled={busy||working}>Sign in</button></form>}
      {identity.actor&&<><div className={styles.account}><span>{session?.user.email??email}{authNeeded?' · Sign-in required':''}</span><span>{dirty?'Unfinished work retained':'No unfinished work'}</span><button disabled={busy||working} onClick={()=>dirty?setConfirmSignOut(true):void signOut()}>Sign out</button></div>
        <div className={styles.directory}><label>Workspace organization<select value={scope?.id??''} disabled={busy||authNeeded||!session} onChange={event=>void navigate({screen:active,organization:event.target.value||null})}><option value="">Choose an organization</option>{scope&&!organizations.some(item=>item.id===scope.id)&&<option value={scope.id}>{scope.name} · {scope.role}</option>}{organizations.map(item=><option key={item.id} value={item.id}>{item.name} · {item.role==='owner'?'Organization Super Admin':item.role}</option>)}</select></label><button disabled={busy||authNeeded||!session} onClick={()=>void loadOrganizations().then(current=>current?navigate(locationRef.current,false):undefined).catch(()=>setMessage('Organizations could not be refreshed.'))}>Refresh organizations</button>{more&&<button disabled={busy||authNeeded||!session} onClick={()=>void loadOrganizations(true).catch(()=>setMessage('More organizations could not be loaded.'))}>Load more organizations</button>}</div>
        <nav aria-label="Workspace screens" className={styles.tabs}><button aria-current={active==='schedule'?'page':undefined} onClick={()=>tab('schedule')}>Schedules</button><button aria-current={active==='lifecycle'?'page':undefined} disabled={!scope} onClick={()=>tab('lifecycle')}>Schedule lifecycle</button><button aria-current={active==='invitations'?'page':undefined} disabled={!scope||scope.role==='member'} onClick={()=>tab('invitations')}>Manage invitations</button><button aria-current={active==='acceptance'?'page':undefined} onClick={()=>tab('acceptance')}>Accept invitation</button><button aria-current={active==='provisioning'?'page':undefined} onClick={()=>tab('provisioning')}>Restricted provisioning</button></nav>
      </>}
    </div>
    {identity.actor&&<div key={accountEpoch}>
      {visited.filter(o=>o.role!=='member').map(o=><div key={'permissions:'+o.id} hidden={scope?.id!==o.id}><LocalWorkspaceContext.Provider value={panel('permissions:'+o.id,o,scope?.id===o.id)}><LocalSchedulePermissions/></LocalWorkspaceContext.Provider></div>)}
      <div hidden={active!=='schedule'}><LocalWorkspaceContext.Provider value={panel('schedule',scope,active==='schedule')}><LocalScheduleClient config={config}/></LocalWorkspaceContext.Provider></div>
      <div hidden={active!=='acceptance'}><LocalWorkspaceContext.Provider value={panel('acceptance',null,active==='acceptance')}><LocalAcceptanceClient config={config}/></LocalWorkspaceContext.Provider></div>
      <div hidden={active!=='provisioning'}><LocalWorkspaceContext.Provider value={panel('provisioning',null,active==='provisioning')}><LocalProvisioningClient/></LocalWorkspaceContext.Provider></div>
      {lifecyclePanels.map(id=>{const organization=visited.find(item=>item.id===id)!;const enabled=active==='lifecycle'&&scope?.id===id;return <div key={id} hidden={!enabled}><LocalWorkspaceContext.Provider value={panel('lifecycle:'+id,organization,enabled)}><LocalLifecycleClient/></LocalWorkspaceContext.Provider></div>;})}
      {managementPanels.map(id=>{const organization=visited.find(item=>item.id===id)!;const enabled=active==='invitations'&&scope?.id===id&&scope.role!=='member';return <div key={id} hidden={!enabled}><LocalWorkspaceContext.Provider value={panel('invitations:'+id,organization,enabled)}><LocalInvitationsClient config={config}/></LocalWorkspaceContext.Provider></div>;})}
    </div>}
    <dialog ref={dialog} className={styles.dialog} onCancel={()=>setConfirmSignOut(false)} aria-label="Clear workspace"><h2>Sign out and clear all local work?</h2><p>Unsaved schedule edits, account workflow drafts and pending request details will be cleared. A request already sent may have completed; clearing this workspace does not undo it.</p><div><button disabled={busy||working} onClick={()=>setConfirmSignOut(false)}>Keep working</button><button disabled={busy||working} onClick={()=>void signOut()}>Sign out and clear</button></div></dialog>
  </div>;
}
