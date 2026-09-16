'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocalWorkspace, useWorkspacePanelState } from '@/components/local/LocalWorkspaceContext';
import { ProvisioningController, sendProvisioningAttempt } from '@/lib/platform/provisioning-controller';
import { InvitationError, type FailureKind } from '@/lib/platform/invitation-controller';
import styles from '../local-invitations/invitations.module.css';

const blank = { ownerUserId:'', name:'', slug:'', timezone:'UTC', locale:'en', countryCode:'', currency:'', reason:'' };
const fields = [
  ['ownerUserId','Existing verified owner UUID',36],['name','Organization name',120],['slug','Organization address name',120],
  ['timezone','Timezone',100],['locale','Locale',35],['countryCode','Country code (optional)',2],['currency','Currency (optional)',3],['reason','Provisioning reason',500],
] as const;
const errors: Record<FailureKind,string> = {
  auth:'Sign in again with the same account. Your draft and original request are retained.',
  mfa:'Verify a fresh authenticator code, then retry the same request.',
  denied:'Provisioning is unavailable for this account or input. Organization Owner/Admin roles do not grant platform-operator access.',
  rate:'The provisioning rate limit was reached. Wait before retrying the same request.',
  conflict:'This request or organization address conflicts with existing data. The original review is retained; do not silently replace its key.',
  unknown:'The result is uncertain. Retry the exact request to recover its existing result or complete it once.',
};
export default function LocalProvisioningClient() {
  const workspace = useLocalWorkspace()!;
  const [controller] = useState(() => new ProvisioningController(() => crypto.randomUUID()));
  const [draft,setDraft] = useState({...blank}), [busy,setBusy] = useState(false), [,redraw] = useState(0);
  const [message,setMessage] = useState('Use an existing verified owner account supplied through the established operator process.');
  const [mfa,setMfa] = useState<'checking'|'missing'|'code'|'ready'>('checking'), [factor,setFactor] = useState(''), [code,setCode] = useState('');
  const [discard,setDiscard] = useState(false), dialog = useRef<HTMLDialogElement>(null), review = useRef<HTMLElement>(null);
  const generation = useRef(0), busyRef = useRef(false), session = useRef(workspace.session);
  session.current = workspace.session;
  const ready = !!workspace.session && !workspace.authNeeded;
  const attempt = controller.attempt;
  const dirty = !!attempt || !!code || fields.some(([key]) => draft[key] !== blank[key]);
  useWorkspacePanelState(dirty,busy);
  const refresh = () => redraw(value => value + 1);
  useEffect(() => { const epoch=generation; return () => { epoch.current++; controller.bind(null); }; },[controller]);
  useEffect(() => { if (discard && workspace.active) dialog.current?.showModal(); else dialog.current?.close(); },[discard,workspace.active]);
  useEffect(() => { if (attempt && workspace.active) review.current?.focus(); },[attempt,workspace.active]);
  useEffect(() => { const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn); },[dirty]);
  function failure(kind:FailureKind) { setMessage(errors[kind]); if(kind==='auth')workspace.requireAuth();if(kind==='mfa'){setCode('');setMfa(factor?'code':'missing');} }
  async function run(action:()=>Promise<void>) {
    if(busyRef.current)return; const stamp=generation.current;busyRef.current=true;setBusy(true);
    try { await action(); } catch(error) { if(stamp===generation.current)failure(error instanceof InvitationError?error.kind:'unknown'); }
    finally { if(stamp===generation.current){busyRef.current=false;setBusy(false);refresh();} }
  }
  async function inspectMfa() {
    const stamp=generation.current;
    const [levels,factors]=await Promise.all([workspace.client.auth.mfa.getAuthenticatorAssuranceLevel(),workspace.client.auth.mfa.listFactors()]);
    if(stamp!==generation.current)return;
    if(levels.error||factors.error||!levels.data||!factors.data)throw new InvitationError('auth');
    const verified=factors.data.totp.find(item=>item.status==='verified');setFactor(verified?.id??'');setCode('');
    setMfa(levels.data.currentLevel==='aal2'?'ready':verified?'code':'missing');
  }
  useEffect(() => {
    if(workspace.session)controller.bind(workspace.session.user.id);
    if(workspace.active&&workspace.session&&!workspace.authNeeded)void run(inspectMfa);
    // One retained panel belongs to the workspace account; session changes preserve its review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workspace.active,workspace.authNeeded,workspace.session?.access_token]);
  function clearReview(){controller.clear();setDiscard(false);refresh();setMessage('Local review cleared. Draft retained; no completed organization is undone.');}
  async function submit(){await run(async()=>{const pending=controller.submit(value=>sendProvisioningAttempt(value,session.current));refresh();await pending;if(controller.failure)failure(controller.failure);else if(controller.result)setMessage('Provisioning confirmed. Organization access still requires the current account’s own membership.');});}
  return <div className={styles.page}><main className={styles.main}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL PLATFORM REHEARSAL</span><h1>Restricted provisioning</h1><p>For designated active platform superadmins only.</p></div><span className={styles.badge}>Fictional data only</span></header>
    <p className={styles.notice}>Owner/Admin organization roles do not authorize this action. The existing server checks operator status, recent MFA, the verified owner and rate limits on every confirmation or retry. No account search or creation is provided here.</p>
    <p role="status" className={styles.status}>{message}</p>
    {ready&&<section className={styles.card} aria-label="Provisioning authentication"><h2>Authenticator verification</h2>
      {mfa==='checking'&&<p>Checking this session’s authenticator state.</p>}
      {mfa==='missing'&&<p>This workflow requires a previously enrolled authenticator. Account and authenticator setup remain separate.</p>}
      {mfa==='ready'&&<><p>MFA session available. The server checks its freshness when you submit.</p><button className={styles.secondary} disabled={busy||!factor} onClick={()=>{setCode('');setMfa('code');}}>Verify again</button></>}
      {mfa==='code'&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void run(async()=>{
        const result=await workspace.client.auth.mfa.challengeAndVerify({factorId:factor,code});setCode('');
        if(result.error?.status===401){failure('auth');return;}
        if(result.error){setMessage('Code not verified. Use a fresh code or sign in again; your review is retained.');return;}
        await inspectMfa();setMessage('Authenticator verified. Review or retry the unchanged provisioning request.');
      });}}><label>Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" value={code} onChange={event=>setCode(event.target.value)}/></label><button disabled={busy}>Verify authenticator</button></form>}
    </section>}
    <section className={styles.card} aria-label="Organization provisioning draft"><h2>New organization</h2><p>The supplied owner UUID must already represent a verified, non-anonymous account. Supplying a UUID does not verify it; the server makes that decision without exposing account details.</p>
      <form className={styles.form} onSubmit={event=>{event.preventDefault();if(!ready||busyRef.current||attempt)return;try{controller.prepare(draft);refresh();setMessage('Review the exact owner and organization settings before confirming.');}catch{setMessage('Check the owner UUID, name, address, timezone, locale, optional codes and required reason.');}}}>
        <fieldset disabled={!ready||busy||!!attempt}>{fields.map(([key,label,max])=><label key={key}>{label}<input required={!['countryCode','currency'].includes(key)} maxLength={max} autoComplete="off" value={draft[key]} onChange={event=>setDraft(previous=>({...previous,[key]:event.target.value}))}/></label>)}</fieldset>
        <button disabled={!ready||busy||!!attempt}>Review provisioning</button><button type="button" className={styles.secondary} disabled={busy||!!attempt} onClick={()=>setDraft({...blank})}>Clear provisioning draft</button>
      </form>
    </section>
    {attempt&&<section ref={review} tabIndex={-1} className={`${styles.card} ${styles.review}`} aria-label="Provisioning request review" style={{overflowWrap:'anywhere'}}><div className={styles.sectionTitle}><h2>Review organization provisioning</h2><span className={styles.badge}>{controller.phase}</span></div>
      <p className={styles.identifier}>Request key: {attempt.key}</p>{fields.map(([key,label])=><p key={key}><strong>{label}:</strong> <span className={key==='ownerUserId'?styles.identifier:undefined}>{attempt.body[key]||'Not supplied'}</span></p>)}
      {controller.failure&&<p role="alert">{errors[controller.failure]}</p>}
      {controller.result&&<><p className={styles.identifier}>Organization: {controller.result}</p><p>Creating an organization for another owner does not add your account as a member.</p><button disabled={!ready||busy} onClick={()=>workspace.openOrganization(controller.result!)}>Open organization if accessible</button></>}
      <div className={styles.actions}>{controller.phase==='success'?<button disabled={busy} onClick={()=>{controller.clear();setDraft({...blank});refresh();setMessage('Result acknowledged.');}}>Acknowledge provisioning result</button>:<>
        <button disabled={!ready||mfa!=='ready'||busy||controller.phase==='conflict'} onClick={()=>void submit()}>{controller.phase==='review'?'Confirm provisioning':'Retry same provisioning request'}</button>
        <button className={styles.secondary} disabled={busy} onClick={()=>controller.phase==='review'?clearReview():setDiscard(true)}>{controller.phase==='review'?'Back to provisioning draft':'Discard provisioning review'}</button>
      </>}</div>
    </section>}
    <dialog ref={dialog} className={styles.dialog} aria-label="Discard provisioning review" onCancel={()=>setDiscard(false)}><h2>Discard this local review?</h2><p>An earlier request may have completed. Discarding its key does not undo it; a new key could create another organization. Retry the same request to recover its result first.</p><div className={styles.actions}><button onClick={()=>setDiscard(false)}>Keep review</button><button onClick={clearReview}>Discard local review</button></div></dialog>
  </main></div>;
}
