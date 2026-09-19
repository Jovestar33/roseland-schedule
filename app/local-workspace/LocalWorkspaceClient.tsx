'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { ScheduleRepositoryError } from '@/lib/platform/schedule-repository';
import { createWorkspaceRepository, type WorkspaceOrganization } from '@/lib/platform/workspace-repository';
import { parseWorkspaceLocation, workspaceHref, WorkspaceIdentity, type WorkspaceLocation, type WorkspaceScreen } from '@/lib/platform/workspace-navigation';
import { LocalWorkspaceContext, type WorkspacePanelState, type WorkspaceScheduleRequest } from '@/components/local/LocalWorkspaceContext';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import AppHeader from '@/components/AppHeader';
import LocalScheduleClient from '../local-schedule/LocalScheduleClient';
import LocalInvitationsClient from '../local-invitations/LocalInvitationsClient';
import LocalAcceptanceClient from '../local-accept-invitation/LocalAcceptanceClient';
import styles from './workspace.module.css';
import { accountSessionStorage } from '@/lib/platform/account-session';
import LocalMfaAccess from '@/components/local/LocalMfaAccess';
import LocalOrganizationSecurity from '@/components/local/LocalOrganizationSecurity';
import LocalOrganizationDeletion from '@/components/local/LocalOrganizationDeletion';
import type {OrganizationLifecycle} from '@/lib/platform/organization-lifecycle';
import LocalOrganizationMembers from '@/components/local/LocalOrganizationMembers';
import LocalAccountAccess from '@/components/local/LocalAccountAccess';
import LocalSchedulePermissions from '@/components/local/LocalSchedulePermissions';
import LocalLifecycleClient from './LocalLifecycleClient';
import LocalProvisioningClient from './LocalProvisioningClient';
import LocalOrganizationSettings from '@/components/local/LocalOrganizationSettings';

const initial:WorkspaceLocation={screen:'schedule',organization:null};
export default function LocalWorkspaceClient({config,review=false}:{config:LocalEditorConfig;review?:boolean}){
  const [showSettings,setShowSettings]=useState(false);
  const href=(value:WorkspaceLocation)=>workspaceHref(value,review?'/review':'/local-workspace');
  const [authStorage]=useState(()=>accountSessionStorage('rp-b08:'+config.supabaseUrl));
  const [rememberSession,setRememberSession]=useState(false),[accountReady,setAccountReady]=useState(!config.accountOnboarding);
  const [organizationLifecycles,setOrganizationLifecycles]=useState<Record<string,OrganizationLifecycle>>({}),[lifecycleRevision,setLifecycleRevision]=useState(0);
  const lifecycleDenied=useRef<()=>void>(()=>{});
  lifecycleDenied.current=()=>setLifecycleRevision(v=>v+1);
  const onLifecycleChange=useCallback((state:OrganizationLifecycle)=>setOrganizationLifecycles(old=>JSON.stringify(old[state.organization_id])===JSON.stringify(state)?old:{...old,[state.organization_id]:state}),[]);
  const [mfaReady,setMfaReady]=useState(false),[mfaRevision,setMfaRevision]=useState(0),[recentMfa,setRecentMfa]=useState(false);
  const mfaRequired=useRef<(token:string|null,recent:boolean)=>void>(()=>{});
  const mfaVerified=useCallback(()=>{setRecentMfa(false);setMfaRevision(v=>v+1);},[]);
  const [policyRevision,setPolicyRevision]=useState(0);
  const policyRequired=useRef<(token:string|null)=>void>(()=>{});
  const [pendingInvitation,setPendingInvitation]=useState<{actor:string;id:string}|null>(null);
  const expired=useRef<(token:string|null)=>void>(()=>{});
  const [client]=useState(()=>createClient(config.supabaseUrl,config.anonymousKey,{
    auth:config.accountOnboarding?{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:authStorage,storageKey:'account-session'}:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{async fetch(input,init){
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(url.origin!==config.supabaseUrl)throw new Error('Local request required');
      const response=await fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if((response.status===403||response.status===404)&&url.pathname.startsWith('/rest/v1/')){const body=await response.clone().json().catch(()=>null);mfaRequired.current(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization'),body?.message==='mfa_recent_required');}
      if(response.status===423&&url.pathname.startsWith('/rest/v1/'))lifecycleDenied.current();
      if(response.status===428 && url.pathname.startsWith('/rest/v1/'))policyRequired.current(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization'));
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
  const [lifecyclePanels,setLifecyclePanels]=useState<string[]>([]),[scheduleRequest,setScheduleRequest]=useState<WorkspaceScheduleRequest|null>(null),scheduleSequence=useRef(0),teamRequest=useRef<string|null>(null);
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
  policyRequired.current=token=>{if(token===`Bearer ${sessionRef.current?.access_token}`){setAccountReady(false);setPolicyRevision(value=>value+1);setMessage('Review the updated account notices. Your unfinished work is retained.');}};
  mfaRequired.current=(token,recent)=>{if(token===`Bearer ${sessionRef.current?.access_token}`){if(recent)setRecentMfa(true);setMfaRevision(v=>v+1);}};
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
      if(organization&&next.schedule&&next.screen==='schedule'){const key=`${actor}:${organization.id}:${next.schedule}`;if(teamRequest.current!==key){teamRequest.current=key;setScheduleRequest({id:next.schedule,organization:organization.id,sequence:++scheduleSequence.current});}}else teamRequest.current=null;
      if(push)history.pushState(null,'',href(next));else history.replaceState(null,'',href(next));return true;
    }catch(error){
      if(ticket===navigationTicket.current&&identity.current(generation)){
        if(error instanceof ScheduleRepositoryError && error.kind==='unauthenticated')requireAuth();
        else setMessage('Navigation could not finish. Your current workspace and drafts are retained.');
        history.replaceState(null,'',href(locationRef.current));
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
        navigationTicket.current++;directoryTicket.current++;useScheduleStore.getState().newSchedule();setPanels({});setVisited([]);setOrganizationLifecycles({});setManagementPanels([]);setLifecyclePanels([]);setScheduleRequest(null);setOrganizations([]);setScope(null);setMore(false);setAccountEpoch(identity.generation);
      }
      // Keep the known account address for reauthentication after a cross-tab sign-out.
      if(next)setEmail(next.user.email??'');
      sessionRef.current=next;setSession(next);
      if(next&&_event==='INITIAL_SESSION')setMessage(previous=>previous==='Sign in once to use the local rehearsals.'?'Checking your remembered account.':previous);
      if(!next&&identity.actor)requireAuth();
    });
    return()=>{navigationRequests.current++;directoryRequests.current++;identity.clear();useScheduleStore.getState().newSchedule();subscription.data.subscription.unsubscribe();};
  },[client,identity,requireAuth]);
  useEffect(()=>{
    if(!session || authNeeded || !accountReady)return;
    setMessage(previous=>previous==='Checking your remembered account.'?'Your remembered account is ready. Choose an organization or review an invitation.':previous);
    void loadOrganizations().then(current=>current?navigate(locationRef.current,false):undefined).catch(()=>setMessage('Organizations could not be refreshed. Your drafts are retained.'));
    // Account epoch and navigation tickets guard asynchronous directory reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.access_token,authNeeded,accountReady]);
  useEffect(()=>{
    if(!session||authNeeded||!accountReady)return;
    const refresh=()=>{if(document.visibilityState==='visible'){setMfaRevision(v=>v+1);void loadOrganizations().then(current=>current?navigate(locationRef.current,false):undefined).catch(()=>{});}};
    const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
    // The directory and navigation use the current actor/ticket fences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.access_token,authNeeded,accountReady]);
  useEffect(()=>{
    const pop=()=>{void navigate(parseWorkspaceLocation(window.location.search),false);};
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
    // The actor, current location and request identity are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[repository,identity]);
  useEffect(()=>{if(confirmSignOut)dialog.current?.showModal();else dialog.current?.close();},[confirmSignOut]);
  async function login(event:React.FormEvent){
    event.preventDefault();if(busyRef.current||working)return;busyRef.current=true;setBusy(true);
    try{if(config.accountOnboarding)authStorage.setRemember(rememberSession);const r=await client.auth.signInWithPassword({email:sessionRef.current?.user.email??email,password});setPassword('');if(r.error||!r.data.session){setMessage('Sign-in failed. Check your fictional account details.');return;}if(config.accountOnboarding)client.auth.startAutoRefresh();setEmail(r.data.user.email??email);setAuthNeeded(false);setMessage('Signed in. Choose an organization or accept a fictional invitation.');}
    catch{setPassword('');setMessage('Sign-in could not finish. Your drafts are retained.');}finally{busyRef.current=false;setBusy(false);}
  }
  async function signOut(){
    if(busyRef.current||working)return;busyRef.current=true;setBusy(true);
    try{if(sessionRef.current){const r=await client.auth.signOut({scope:'local'});if(r.error)throw new Error('Sign out unavailable');}
      navigationTicket.current++;directoryTicket.current++;identity.clear();useScheduleStore.getState().newSchedule();setAccountEpoch(identity.generation);setPanels({});setVisited([]);setOrganizationLifecycles({});setManagementPanels([]);setLifecyclePanels([]);setScheduleRequest(null);setOrganizations([]);setScope(null);setMore(false);setSession(null);sessionRef.current=null;setEmail('');setPassword('');setAuthNeeded(false);setConfirmSignOut(false);setLocation(initial);locationRef.current=initial;history.replaceState(null,'',href(initial));setMessage('Signed out. Tab-only drafts and requests cleared. Retained source drafts, template requests and appearance requests remain available to their original account.');
    }catch{setMessage('Sign-out could not finish. Your workspace is retained.');}finally{busyRef.current=false;setBusy(false);}
  }
  const active=location.screen;
  const onScheduleSelection=(organization:string,id:string|null)=>{
    if(!review||locationRef.current.screen!=='schedule'||locationRef.current.organization!==organization)return;
    const next:WorkspaceLocation={screen:'schedule',organization,...(id?{schedule:id}:{})};
    teamRequest.current=id?`${identity.actor}:${organization}:${id}`:null;
    if(href(next)===href(locationRef.current))return;
    locationRef.current=next;setLocation(next);history.pushState(null,'',href(next));
  };
  const openOrganization=(id:string)=>{void navigate({screen:'schedule',organization:id});};
  const openSchedule=(organization:string,id:string)=>{const generation=identity.capture();void navigate({screen:'schedule',organization}).then(ok=>{if(ok&&identity.current(generation)&&locationRef.current.organization===organization&&locationRef.current.screen==='schedule')setScheduleRequest({id,organization,sequence:++scheduleSequence.current});});};
  const openLifecycle=(organization:string,id:string)=>{const generation=identity.capture();void navigate({screen:'lifecycle',organization}).then(ok=>{if(ok&&identity.current(generation)&&locationRef.current.organization===organization&&locationRef.current.screen==='lifecycle')setScheduleRequest({id,organization,sequence:++scheduleSequence.current,target:'lifecycle'});});};
  const panel=(id:string,organization:WorkspaceOrganization|null,enabled:boolean)=>({review,openSettings:()=>setShowSettings(true),client,session,authNeeded:authNeeded||!accountReady||!mfaReady||organization?.access_state==='mfa_required',organization,active:enabled&&accountReady&&mfaReady&&organization?.access_state!=='mfa_required',panelId:id,report,requireAuth,readOnly:!!organization&&organizationLifecycles[organization.id]?.read_only===true,lifecycleVersion:organization?organizationLifecycles[organization.id]?.version??-1:0,lifecycleRevision,onLifecycleChange,openOrganization,openSchedule,onScheduleSelection,openLifecycle,scheduleRequest,consumeScheduleRequest});
  function tab(screen:WorkspaceScreen){if(authNeeded||!session||!accountReady){return;}void navigate({screen,organization:locationRef.current.organization});}
  return <div className={review?undefined:styles.page}>
    {review?<AppHeader actions={(!location.schedule||showSettings)?<button className="btn btn-light btn-sm" onClick={()=>{if(showSettings)tab('schedule');setShowSettings(v=>!v);}}>{showSettings?'Back to schedules':'Account & settings'}</button>:undefined}/>:<header className={styles.header}><div><span className={styles.eyebrow}>LOCAL WORKSPACE</span><h1>Roseland rehearsals</h1><p>One account, with unfinished work kept in this tab.</p></div><span className={styles.badge}>Fictional data only</span></header>}
    <div className={`${styles.shell} ${review?styles.reviewShell:''}`} style={review&&!!location.schedule&&!showSettings?{padding:0}:undefined}>
      {!review&&<p className={styles.notice}>Switching local screens keeps drafts and request details. Closing or reloading loses tab-only requests. Duplicate source backups and template or appearance request receipts can be recovered by the original account on this computer. {config.accountOnboarding?'Email stays in the local mail sink. Remember me retains sign-in only; idle expiry still applies.':'No email is sent.'}</p>}
      {(!review||! /^(Your remembered|Checking your remembered|Signed in|Sign in once)/.test(message))&&<p role="status" aria-live="polite" className={styles.status}>{message}</p>}
      {(!session||authNeeded)&&<form className={styles.login} onSubmit={login} aria-label="Workspace sign in"><h2>{identity.actor?'Sign in again':'Sign in'}</h2><label>Fictional account email<input type="email" required autoComplete="off" readOnly={!!identity.actor} value={session?.user.email??email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="off" value={password} onChange={event=>setPassword(event.target.value)}/></label><button disabled={busy||working}>Sign in</button>{config.accountOnboarding&&<label><input type="checkbox" checked={rememberSession} onChange={event=>setRememberSession(event.target.checked)}/> Remember me on this personal device</label>}</form>}
      <div hidden={review&&!showSettings&&!!session&&accountReady&&mfaReady&&!authNeeded}>
      {config.accountOnboarding&&<LocalAccountAccess config={config} client={client} session={session} authNeeded={authNeeded} onReady={setAccountReady} requireAuth={requireAuth} policyRevision={policyRevision} onInvitation={setPendingInvitation}/>}
      <LocalMfaAccess key={accountEpoch} client={client} session={session} authNeeded={authNeeded} organization={scope?.id??null} revision={mfaRevision} recentRequired={recentMfa} onReady={setMfaReady} onVerified={mfaVerified}/>
      </div>
      {pendingInvitation?.actor===session?.user.id&&accountReady&&<p>Verified invitation ready. <button onClick={()=>tab('acceptance')}>Review verified invitation</button></p>}
      {identity.actor&&<><div hidden={review&&!showSettings}><div className={styles.account}><span>{session?.user.email??email}{authNeeded?' · Sign-in required':''}</span><span>{dirty?'Unfinished work retained':'No unfinished work'}</span><button disabled={busy||working} onClick={()=>dirty?setConfirmSignOut(true):void signOut()}>Sign out</button></div></div>
        <div hidden={review&&!!location.schedule&&!showSettings} className={styles.directory}><label>{review?'Organization':'Workspace organization'}<select value={scope?.id??''} disabled={busy||authNeeded||!session||!accountReady} onChange={event=>void navigate({screen:active,organization:event.target.value||null})}><option value="">Choose an organization</option>{scope&&!organizations.some(item=>item.id===scope.id)&&<option value={scope.id}>{scope.name}{!review&&<> · {scope.role}</>}</option>}{organizations.map(item=><option key={item.id} value={item.id}>{item.name}{!review&&<> · {item.role==='owner'?'Organization Super Admin':item.role}</>}</option>)}</select></label><button hidden={review&&!showSettings} disabled={busy||authNeeded||!session||!accountReady} onClick={()=>void loadOrganizations().then(current=>current?navigate(locationRef.current,false):undefined).catch(()=>setMessage('Organizations could not be refreshed.'))}>Refresh organizations</button>{more&&<button disabled={busy||authNeeded||!session||!accountReady} onClick={()=>void loadOrganizations(true).catch(()=>setMessage('More organizations could not be loaded.'))}>Load more organizations</button>}</div>
        <nav hidden={review&&!showSettings} aria-label="Workspace screens" className={styles.tabs}><button aria-current={active==='schedule'?'page':undefined} onClick={()=>tab('schedule')}>Schedules</button><button aria-current={active==='lifecycle'?'page':undefined} disabled={!scope} onClick={()=>tab('lifecycle')}>Schedule lifecycle</button><button aria-current={active==='invitations'?'page':undefined} disabled={!scope||scope.role==='member'} onClick={()=>tab('invitations')}>Manage invitations</button><button aria-current={active==='acceptance'?'page':undefined} onClick={()=>tab('acceptance')}>Accept invitation</button><button aria-current={active==='provisioning'?'page':undefined} onClick={()=>tab('provisioning')}>Restricted provisioning</button></nav>
      </>}
    </div>
    {identity.actor&&<div key={accountEpoch} hidden={!accountReady||!mfaReady||scope?.access_state==='mfa_required'}>
      {visited.map(o=><div key={'deletion:'+o.id} hidden={scope?.id!==o.id}><LocalWorkspaceContext.Provider value={panel('deletion:'+o.id,o,scope?.id===o.id)}><LocalOrganizationDeletion/></LocalWorkspaceContext.Provider></div>)}
      {visited.filter(o=>o.role!=='member').map(o=><div key={'members:'+o.id} hidden={scope?.id!==o.id||(review&&!showSettings)}><LocalWorkspaceContext.Provider value={panel('members:'+o.id,o,scope?.id===o.id)}><LocalOrganizationMembers/></LocalWorkspaceContext.Provider></div>)}
      {visited.map(o=><div key={'security:'+o.id} hidden={scope?.id!==o.id||(review&&!showSettings)}><LocalWorkspaceContext.Provider value={panel('security:'+o.id,o,scope?.id===o.id)}><LocalOrganizationSecurity/></LocalWorkspaceContext.Provider></div>)}
      {visited.map(o=><div key={'presentation:'+o.id} hidden={scope?.id!==o.id||(review&&!showSettings)}><LocalWorkspaceContext.Provider value={panel('presentation:'+o.id,o,scope?.id===o.id)}><LocalOrganizationSettings/></LocalWorkspaceContext.Provider></div>)}
      {visited.filter(o=>o.role!=='member').map(o=><div key={'permissions:'+o.id} hidden={scope?.id!==o.id||(review&&!showSettings)}><LocalWorkspaceContext.Provider value={panel('permissions:'+o.id,o,scope?.id===o.id)}><LocalSchedulePermissions/></LocalWorkspaceContext.Provider></div>)}
      <div hidden={active!=='schedule'}><LocalWorkspaceContext.Provider value={panel('schedule',scope,active==='schedule')}><LocalScheduleClient config={config}/></LocalWorkspaceContext.Provider></div>
      <div hidden={active!=='acceptance'}><LocalWorkspaceContext.Provider value={panel('acceptance',null,active==='acceptance')}><LocalAcceptanceClient config={config} pendingInvitation={pendingInvitation?.actor===session?.user.id?pendingInvitation:null} onInvitationUsed={()=>setPendingInvitation(null)}/></LocalWorkspaceContext.Provider></div>
      <div hidden={active!=='provisioning'}><LocalWorkspaceContext.Provider value={panel('provisioning',null,active==='provisioning')}><LocalProvisioningClient/></LocalWorkspaceContext.Provider></div>
      {lifecyclePanels.map(id=>{const organization=visited.find(item=>item.id===id)!;const enabled=active==='lifecycle'&&scope?.id===id;return <div key={id} hidden={!enabled}><LocalWorkspaceContext.Provider value={panel('lifecycle:'+id,organization,enabled)}><LocalLifecycleClient/></LocalWorkspaceContext.Provider></div>;})}
      {managementPanels.map(id=>{const organization=visited.find(item=>item.id===id)!;const enabled=active==='invitations'&&scope?.id===id&&scope.role!=='member';return <div key={id} hidden={!enabled}><LocalWorkspaceContext.Provider value={panel('invitations:'+id,organization,enabled)}><LocalInvitationsClient config={config}/></LocalWorkspaceContext.Provider></div>;})}
    </div>}
    <dialog ref={dialog} className={styles.dialog} onCancel={()=>setConfirmSignOut(false)} aria-label="Clear workspace"><h2>Sign out and clear this workspace?</h2><p>Unsaved schedule edits and tab-only workflow drafts will be cleared. Retained source drafts, template requests and appearance requests remain on this computer for the original account. A request already sent may have completed; signing out does not undo it.</p><div><button disabled={busy||working} onClick={()=>setConfirmSignOut(false)}>Keep working</button><button disabled={busy||working} onClick={()=>void signOut()}>Sign out and clear</button></div></dialog>
  </div>;
}
