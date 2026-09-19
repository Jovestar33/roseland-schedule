'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { FICTIONAL_PRIVACY, FICTIONAL_TERMS, parseAccountCallback, type AccountCallback } from '@/lib/platform/account-session';

type Policy = { termsVersion: string; privacyVersion: string; accepted: boolean };
type Props = { review?:boolean; config: LocalEditorConfig; client: SupabaseClient; session: Session | null; authNeeded: boolean;
  onEntryTaskChange?(active:boolean):void; onReady(ready: boolean): void; requireAuth(): void; policyRevision: number; onInvitation(value: {actor:string;id:string}): void };
export default function LocalAccountAccess({ review=false, onEntryTaskChange, config, client, session, authNeeded, onReady, requireAuth, policyRevision, onInvitation }: Props) {
  const [mode, setMode] = useState<'signup' | 'recovery' | null>(null);
  const taskHeading=useRef<HTMLHeadingElement>(null), returnEntry=useRef<'signup'|'recovery'|null>(null);
  const invitationEntry=useRef<HTMLButtonElement>(null), recoveryEntry=useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState(''), [invitation, setInvitation] = useState(''), [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [policy, setPolicy] = useState<Policy | null>(null), [policyChecked, setPolicyChecked] = useState(false);
  const [retry, setRetry] = useState(0), deadline = useRef<number | null>(null), generation = useRef(0);
  const [callback, setCallback] = useState<AccountCallback | null>(null), [callbackEmail, setCallbackEmail] = useState('');
  const [callbackClient] = useState(() => createClient(config.supabaseUrl, config.anonymousKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }) },
  }));
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [factor, setFactor] = useState<string | null>(null), [code, setCode] = useState('');
  const entry=review&&(!session||authNeeded);
  useLayoutEffect(()=>{onEntryTaskChange?.(!!callback||(entry&&!!mode));},[callback,entry,mode,onEntryTaskChange]);
  useEffect(()=>{
    if(!review||busy)return;
    if(callback||mode)taskHeading.current?.focus();
    else if(returnEntry.current){(returnEntry.current==='signup'?invitationEntry:recoveryEntry).current?.focus();returnEntry.current=null;}
  },[callback,mode,review,busy]);
  const callbackActive=useRef(false);
  const sessionRef = useRef(session); sessionRef.current = session;
  const sessionToken=session?.access_token;
  useEffect(() => {
    const receive = () => {
      if (!location.hash) return;
      const parsed = parseAccountCallback(location.hash);
      history.replaceState(null, '', location.pathname + location.search);
      if (callbackActive.current || busyRef.current) { setMessage('Finish or close the current email action before opening another link.'); return; }
      if (parsed) { callbackActive.current=true; setCallback(parsed); setMessage('Review this email action before continuing. Your open workspace has not changed.'); }
      else setMessage('This email link is unavailable. Request a new message if needed.');
    };
    receive(); window.addEventListener('hashchange',receive);
    return () => window.removeEventListener('hashchange',receive);
  }, []);
  useEffect(() => {
    const accountGeneration=generation; const ticket = ++accountGeneration.current; deadline.current = null; setPolicy(null); setPolicyChecked(false); onReady(false);
    if (!sessionToken || authNeeded) return;
    void Promise.all([
      client.rpc('get_account_session_deadline').setHeader('Authorization', `Bearer ${sessionToken}`),
      client.rpc('get_account_policy_status').setHeader('Authorization', `Bearer ${sessionToken}`),
    ]).then(([clock, policies]) => {
      if (ticket !== accountGeneration.current) return;
      if (clock.status === 401 || policies.status === 401) { requireAuth(); return; }
      if (clock.error || policies.error || !Number.isFinite(Date.parse(clock.data)) || !policies.data) {
        setMessage('Account checks are unavailable. Your unfinished work is retained. Retry when connected.'); return;
      }
      deadline.current = Date.parse(clock.data); setPolicy(policies.data); onReady(policies.data.accepted === true);
    }).catch(() => { if (ticket === accountGeneration.current) setMessage('Account checks could not finish. Your unfinished work is retained.'); });
    return () => { accountGeneration.current++; };
  }, [sessionToken, authNeeded, client, onReady, requireAuth, retry, policyRevision]);
  useEffect(() => {
    if (!sessionToken || authNeeded) return;
    let inFlight = false, lastSignal = 0, active = true;
    const token = sessionToken;
    const expired = () => {
      if (deadline.current !== null && Date.now() >= deadline.current) {
        deadline.current = null; client.auth.stopAutoRefresh(); onReady(false); requireAuth();
        setMessage('You have been inactive for one hour. Sign in again; unfinished work is retained for this account.');
        return true;
      }
      return false;
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible' || expired() || !deadline.current || inFlight || Date.now() - lastSignal < 5000) return;
      lastSignal = Date.now(); inFlight = true;
      void Promise.resolve(client.rpc('record_account_activity').setHeader('Authorization', `Bearer ${token}`)).then(result => {
        if (!active || sessionRef.current?.access_token !== token) return;
        if (result.status === 401) { onReady(false); requireAuth(); }
        else if (!result.error && Number.isFinite(Date.parse(result.data))) deadline.current = Date.parse(result.data) + 3600000;
      }).finally(() => { inFlight = false; });
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    const timer = window.setInterval(expired, 1000);
    return () => { active = false; clearInterval(timer); events.forEach(name => window.removeEventListener(name, activity)); };
  }, [sessionToken, authNeeded, client, onReady, requireAuth]);
  useEffect(() => { setEmail(''); setInvitation(''); setAccepted(false); setMode(null); if (!callbackActive.current) setMessage(''); }, [session?.user.id]);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true);
    try { await action(); } catch { setMessage('The outcome is uncertain. Check your email or try signing in before requesting another message.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function requestMail(event: React.FormEvent) {
    event.preventDefault(); await run(async () => {
      const result = await fetch('/api/platform/local-account/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, ...(mode === 'signup' ? { invitationId: invitation, accepted } : {}) }),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const data = await result.json(); setMessage(data.message ?? 'Request unavailable.');
    });
  }
  async function verifyLink() { await run(async () => {
    if (!callback) return;
    const result = await callbackClient.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
    if (result.error || !result.data.session) { setMessage('This email link is unavailable or has already been used. Try signing in or request a new message.'); return; }
    setCallbackEmail(result.data.user?.email ?? 'Verified account');
    const factors = await callbackClient.auth.mfa.listFactors();
    setFactor(factors.data?.totp.find(value => value.status === 'verified')?.id ?? null);
    setMessage('Email verified. Set your password below; then sign in again. This has not accepted organization access.');
  }); }
  async function changePassword(event: React.FormEvent) { event.preventDefault(); await run(async () => {
    if (password !== confirmation) { setMessage('Passwords must match.'); return; }
    if (factor) {
      const verified = await callbackClient.auth.mfa.challengeAndVerify({ factorId: factor, code }); setCode('');
      if (verified.error) { setMessage('Authenticator verification is required. No recovery bypass is available.'); return; }
    }
    const result = await callbackClient.auth.updateUser({ password }); setPassword(''); setConfirmation('');
    if (result.error) { setMessage('Password change was not confirmed. Check password requirements and required MFA, or try signing in before using another link.'); return; }
    await callbackClient.auth.signOut({ scope: 'local' });
    if (sessionRef.current?.user.id === result.data.user.id) { onReady(false); requireAuth(); }
    const id = callback?.invitationId; if (id) onInvitation({actor:result.data.user.id,id});
    callbackActive.current=false; setCallback(null); setCallbackEmail(''); setFactor(null);
    setMessage('Password saved. Existing sessions are invalidated. Sign in with your new password and any required MFA, then review your invitation.');
  }); }
  return <section aria-label="Account access" data-account-task={entry&&!!mode||review&&!!callback||undefined} aria-busy={busy} style={{ margin: '12px 0', maxWidth: 720 }}>
    <p hidden={!message||(review&&authNeeded&&/^(You have been inactive|Account checks)/.test(message))} role="status" aria-live="polite">{message}</p>
    {session && !authNeeded && !policy && (!review||!callback) && <button disabled={busy} onClick={() => setRetry(value => value + 1)}>Retry account checks</button>}
    {policy && !policy.accepted && (!review||(!callback&&!!session&&!authNeeded)) && <form onSubmit={event => { event.preventDefault(); void run(async () => {
      if (!policyChecked || !session) return;
      const token = session.access_token;
      const result = await client.rpc('accept_account_policies', { terms_version: policy.termsVersion, privacy_version: policy.privacyVersion }).setHeader('Authorization', `Bearer ${token}`);
      if (sessionRef.current?.access_token !== token) return;
      if (result.error) { setMessage('Acceptance was not confirmed. Review the current notices and retry.'); setRetry(value => value + 1); return; }
      setPolicy(result.data); onReady(result.data?.accepted === true);
    }); }}>
      <h2>Review current policies</h2><FictionalNotices terms={policy.termsVersion} privacy={policy.privacyVersion}/>
      <label style={{display:'flex',alignItems:'flex-start'}}><input type="checkbox" checked={policyChecked} onChange={e => setPolicyChecked(e.target.checked)}/> I accept the Terms of Service and acknowledge the Privacy Policy.</label>
      <p><button disabled={busy || !policyChecked}>Continue</button></p>
    </form>}
    {callback ? <div>
      <h2 ref={taskHeading} tabIndex={-1}>{callback.type === 'invite' ? 'Verify your invited account' : 'Reset your password'}</h2>
      {!callbackEmail ? <button disabled={busy} onClick={() => void verifyLink()}>Verify email link</button> : <form onSubmit={changePassword}>
        <p>Verified account: {callbackEmail}. Your current workspace is kept separately.</p>
        <label>New password <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
        <p>Use at least 12 characters including upper/lowercase letters and a number.</p>
        <label>Repeat password <input required type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>
        {factor && <label>Authenticator code <input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)}/></label>}
        <p><button disabled={busy}>Save password and sign out existing sessions</button></p>
      </form>}
      <button disabled={busy} onClick={() => void run(async () => { await callbackClient.auth.signOut({ scope: 'local' }); callbackActive.current=false; returnEntry.current='recovery'; setCallback(null); setCallbackEmail(''); setFactor(null); setPassword(''); setConfirmation(''); setCode(''); setMessage(''); })}>Close email action</button>
    </div> : <>
      {review&&(!session||authNeeded)?<div data-account-entry hidden={!!mode}>
        <button ref={recoveryEntry} type="button" disabled={busy} aria-expanded={mode==='recovery'} onClick={()=>setMode(mode==='recovery'?null:'recovery')}>Forgot password?</button>
        <button ref={invitationEntry} type="button" disabled={busy} aria-expanded={mode==='signup'} onClick={()=>setMode(mode==='signup'?null:'signup')}>Have an invitation?</button>
      </div>:<>
        {!review&&<><button disabled={busy} onClick={() => setMode(mode === 'signup' ? null : 'signup')}>Create invited account</button>{' '}</>}
        <button disabled={busy} onClick={() => setMode(mode === 'recovery' ? null : 'recovery')}>{review&&session&&!authNeeded?'Reset password':'Forgot password'}</button>
      </>}
      {mode && <form onSubmit={requestMail} aria-label={mode==='signup'?'Invitation setup':'Password recovery'}>
        <h2 ref={taskHeading} tabIndex={-1}>{review?(mode==='signup'?'Set up your invited account':'Reset your password'):(mode==='signup'?'Create an invited account':'Request password recovery')}</h2>
        <label>Email <input required type="email" maxLength={320} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>
        {mode === 'signup' && <>
          <p><label>Invitation ID <input required value={invitation} onChange={e => setInvitation(e.target.value)}/></label></p>
          <FictionalNotices terms={FICTIONAL_TERMS} privacy={FICTIONAL_PRIVACY}/>
          <label style={{display:'flex',alignItems:'flex-start'}}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/> I accept the Terms of Service and acknowledge the Privacy Policy.</label>
        </>}
        <p><button data-account-primary disabled={busy || (mode === 'signup' && !accepted)}>{busy?'Sending…':'Send email'}</button></p>
        <p>Local fictional testing only. Messages stay in the local mail sink. A sent request may complete even if its reply is lost.</p>
        {review&&(!session||authNeeded)&&<div data-account-entry><button type="button" disabled={busy} onClick={()=>{returnEntry.current=mode;setMode(null);}}>Back to sign in</button></div>}
      </form>}
    </>}
  </section>;
}
function FictionalNotices({ terms, privacy }: { terms: string; privacy: string }) {
  return <div><p><strong>Fictional test notices — not legal terms.</strong></p>
    <details><summary>Terms of Service ({terms})</summary><p>This fictional local rehearsal uses synthetic accounts and data only. This notice exists to test versioned acceptance and grants no production rights.</p></details>
    <details><summary>Privacy Policy ({privacy})</summary><p>This fictional local rehearsal records your synthetic account, accepted notice versions and timestamps. It is not an approved privacy policy or a compliance claim.</p></details>
  </div>;
}
