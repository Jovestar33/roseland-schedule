'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { FICTIONAL_PRIVACY, FICTIONAL_TERMS, accountPolicyAllowsEntry, parseAccountCallback, type AccountCallback } from '@/lib/platform/account-session';

type Policy = { termsVersion: string; privacyVersion: string; accepted: boolean; enforced?: boolean };
type Props = { review?:boolean; showMaintenance?:boolean; config: LocalEditorConfig; client: SupabaseClient; session: Session | null; authNeeded: boolean;
  onEntryTaskChange?(active:boolean):void; onReady(ready: boolean): void; requireAuth(): void; policyRevision: number; onInvitation(value: {actor:string;id:string}): void };
export default function LocalAccountAccess({ review=false, showMaintenance=true, onEntryTaskChange, config, client, session, authNeeded, onReady, requireAuth, policyRevision, onInvitation }: Props) {
  const [mode, setMode] = useState<'signup' | 'recovery' | null>(null);
  const taskHeading=useRef<HTMLHeadingElement>(null), returnEntry=useRef<'signup'|'recovery'|null>(null);
  const invitationEntry=useRef<HTMLButtonElement>(null), recoveryEntry=useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState(''), [invitation, setInvitation] = useState(''), [accepted, setAccepted] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [policy, setPolicy] = useState<Policy | null>(null), [policyChecked, setPolicyChecked] = useState(false);
  const [retry, setRetry] = useState(0), deadline = useRef<number | null>(null), generation = useRef(0);
  const [callback, setCallback] = useState<AccountCallback | null>(null), [callbackEmail, setCallbackEmail] = useState('');
  const [callbackClient] = useState(() => createClient(config.supabaseUrl, config.anonymousKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }) },
  }));
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [factorChecked, setFactorChecked] = useState(false);
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
      if (callbackActive.current || busyRef.current) { setMessage('Finish this step or cancel before opening another link.'); return; }
      if (parsed) { callbackActive.current=true; setCallback(parsed); setMessage(''); }
      else setMessage('This link has expired or is invalid. Please request a new one.');
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
      deadline.current = Date.parse(clock.data); setPolicy(policies.data); onReady(accountPolicyAllowsEntry(policies.data, config.hosted === true));
    }).catch(() => { if (ticket === accountGeneration.current) setMessage('Account checks could not finish. Your unfinished work is retained.'); });
    return () => { accountGeneration.current++; };
  }, [sessionToken, authNeeded, client, onReady, requireAuth, retry, policyRevision, config.hosted]);
  useEffect(() => {
    if (!sessionToken || authNeeded) return;
    let inFlight = false, lastSignal = 0, active = true;
    const token = sessionToken;
    let checkingExpiry = false, lastExpiryCheck = 0;
    const expireSession = () => {
      deadline.current = null; client.auth.stopAutoRefresh(); onReady(false); requireAuth();
      setMessage('Your session has expired. Sign in again; your unfinished work is retained.');
    };
    const expired = () => {
      if (deadline.current === null || Date.now() < deadline.current) return false;
      // Another tab may have recorded real activity. Check without extending the deadline.
      if (!checkingExpiry && Date.now() - lastExpiryCheck >= 5000) {
        checkingExpiry = true; lastExpiryCheck = Date.now();
        void Promise.resolve(client.rpc('get_account_session_deadline').setHeader('Authorization', `Bearer ${token}`)).then(clock => {
          if (!active || sessionRef.current?.access_token !== token) return;
          if (clock.status === 401) expireSession();
          else if (!clock.error && Number.isFinite(Date.parse(clock.data))) {
            deadline.current = Date.parse(clock.data);
            if (Date.now() >= deadline.current) expireSession();
          }
        }).catch(() => { /* Retry when connected; never renew an unconfirmed session. */ })
          .finally(() => { checkingExpiry = false; });
      }
      return true;
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible' || expired() || !deadline.current || inFlight || Date.now() - lastSignal < 5000) return;
      lastSignal = Date.now(); inFlight = true;
      void Promise.resolve(client.rpc('record_account_activity').setHeader('Authorization', `Bearer ${token}`)).then(async result => {
        if (!active || sessionRef.current?.access_token !== token) return;
        if (result.status === 401) { onReady(false); requireAuth(); }
        else if (!result.error) {
          // The server owns the idle window; never assume one hour or renew on refresh.
          const clock = await client.rpc('get_account_session_deadline').setHeader('Authorization', `Bearer ${token}`);
          if (!active || sessionRef.current?.access_token !== token) return;
          if (clock.status === 401) { onReady(false); requireAuth(); }
          else if (!clock.error && Number.isFinite(Date.parse(clock.data))) deadline.current = Date.parse(clock.data);
        }
      }).catch(() => { /* Keep the last confirmed deadline while offline. */ }).finally(() => { inFlight = false; });
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    const timer = window.setInterval(expired, 1000);
    return () => { active = false; clearInterval(timer); events.forEach(name => window.removeEventListener(name, activity)); };
  }, [sessionToken, authNeeded, client, onReady, requireAuth]);
  useEffect(() => { setEmail(''); setInvitation(''); setAccepted(false); setMailSent(false); setMode(null); if (!callbackActive.current) setMessage(''); }, [session?.user.id]);
  async function run(action: () => Promise<void>, failure = 'Something went wrong. Please try again.') {
    if (busyRef.current) return; busyRef.current = true; setBusy(true);
    try { await action(); } catch { setMessage(failure); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function requestMail(event: React.FormEvent) {
    event.preventDefault(); await run(async () => {
      const result = await fetch(config.hosted?'/api/platform/account/mail':'/api/platform/local-account/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, ...(mode === 'signup' ? { invitationId: invitation, ...(config.hosted?{}:{accepted}) } : {}) }),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const data = await result.json(); setMessage(data.message ?? 'We couldn’t send the link. Please try again.');
      if (result.ok) setMailSent(true);
    }, 'Please check your inbox. If no email arrives, try again in a few minutes.');
  }
  async function checkCallbackSecurity() {
    setFactorChecked(false);
    const factors = await callbackClient.auth.mfa.listFactors();
    if (factors.error || !factors.data) { setMessage('We couldn’t check your account security. Please try again.'); return; }
    setFactor(factors.data.totp.find(value => value.status === 'verified')?.id ?? null);
    setFactorChecked(true); setMessage('');
  }
  async function verifyLink() { await run(async () => {
    if (!callback) return;
    const result = await callbackClient.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
    if (result.error || !result.data.session) { setMessage('This link has expired or has already been used. Please request a new one.'); return; }
    setCallbackEmail(result.data.user?.email ?? 'Verified account');
    await checkCallbackSecurity();
  }); }
  async function changePassword(event: React.FormEvent) { event.preventDefault(); await run(async () => {
    if (!factorChecked) { setMessage('Please retry the security check before continuing.'); return; }
    if (password !== confirmation) { setMessage('Passwords must match.'); return; }
    if (factor) {
      const verified = await callbackClient.auth.mfa.challengeAndVerify({ factorId: factor, code }); setCode('');
      if (verified.error) { setMessage('That code wasn’t accepted. Enter the current 6-digit code from your authenticator app.'); return; }
    }
    const result = await callbackClient.auth.updateUser({ password });
    if (result.error) { setMessage('We couldn’t update your password. Check the requirements below and try again.'); return; }
    setPassword(''); setConfirmation('');
    await callbackClient.auth.signOut({ scope: 'local' });
    if (sessionRef.current?.user.id === result.data.user.id) { onReady(false); requireAuth(); }
    const id = callback?.invitationId; if (id) onInvitation({actor:result.data.user.id,id});
    callbackActive.current=false; setCallback(null); setCallbackEmail(''); setFactor(null); setFactorChecked(false);
    setMode(null); setMailSent(false);
    setMessage(id ? 'Password updated. Sign in to finish joining your team.' : 'Password updated. Sign in with your new password.');
  }); }
  const notice = <p hidden={!message||(review&&authNeeded&&/^(You have been inactive|Account checks)/.test(message))} role="status" aria-live="polite">{message}</p>;
  return <section aria-label="Account access" data-account-task={entry&&!!mode||review&&!!callback||undefined} aria-busy={busy} style={{ margin: '12px 0', maxWidth: 720 }}>
    {!callback&&!mode&&notice}
    {session && !authNeeded && !policy && (!review||!callback) && <button disabled={busy} onClick={() => setRetry(value => value + 1)}>Retry account checks</button>}
    {config.hosted && policy && !accountPolicyAllowsEntry(policy,true) && <p role="alert">Account notices are not ready for review. Contact your administrator. Your unfinished work is retained.</p>}
    {!config.hosted && policy && !policy.accepted && (!review||(!callback&&!!session&&!authNeeded)) && <form onSubmit={event => { event.preventDefault(); void run(async () => {
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
    {callback ? <div data-account-flow>
      <h2 ref={taskHeading} tabIndex={-1}>{callback.type === 'invite' ? 'Set your password' : callbackEmail ? 'Choose a new password' : 'Reset your password'}</h2>
      {notice}
      {!callbackEmail ? <>
        <p>Continue to choose a new password for your account.</p>
        <button data-account-primary disabled={busy} onClick={() => void verifyLink()}>{busy?'Opening link…':'Continue'}</button>
      </> : !factorChecked ? <button data-account-primary disabled={busy} onClick={()=>void run(checkCallbackSecurity)}>{busy?'Checking account…':'Retry security check'}</button> : <form onSubmit={changePassword}>
        <p data-account-address>{callbackEmail}</p>
        <label>New password <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" aria-describedby="reset-password-help" value={password} onChange={e => setPassword(e.target.value)}/></label>
        <p id="reset-password-help" data-account-help>At least 12 characters, with uppercase and lowercase letters and a number.</p>
        <label>Confirm password <input required type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>
        {factor && <div data-account-verification>
          <label>Authenticator code <input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" aria-describedby="reset-authenticator-help" value={code} onChange={e => setCode(e.target.value)}/></label>
          <p id="reset-authenticator-help" data-account-help>Enter the 6-digit code from the authenticator app linked to your account.</p>
          <details><summary>Can’t access your authenticator?</summary><p>Contact your organization’s administrator for help recovering access. Resetting your password does not remove two-step verification.</p></details>
        </div>}
        <button data-account-primary disabled={busy}>{busy?'Updating password…':callback.type==='invite'?'Set password':'Update password'}</button>
        <p data-account-help>For security, you’ll be signed out of your other sessions.</p>
      </form>}
      <div data-account-entry><button disabled={busy} onClick={() => void run(async () => { await callbackClient.auth.signOut({ scope: 'local' }); callbackActive.current=false; returnEntry.current='recovery'; setCallback(null); setCallbackEmail(''); setFactor(null); setFactorChecked(false); setPassword(''); setConfirmation(''); setCode(''); setMessage(''); setMode(null); setMailSent(false); })}>Cancel</button></div>
    </div> : <div hidden={!showMaintenance}>
      {review&&(!session||authNeeded)?<div data-account-entry hidden={!!mode}>
        <button ref={recoveryEntry} type="button" disabled={busy} aria-expanded={mode==='recovery'} onClick={()=>setMode(mode==='recovery'?null:'recovery')}>Forgot password?</button>
        <button ref={invitationEntry} type="button" disabled={busy} aria-expanded={mode==='signup'} onClick={()=>setMode(mode==='signup'?null:'signup')}>Have an invitation?</button>
      </div>:<>
        {!review&&<><button disabled={busy} onClick={() => setMode(mode === 'signup' ? null : 'signup')}>Create invited account</button>{' '}</>}
        <button disabled={busy} onClick={() => setMode(mode === 'recovery' ? null : 'recovery')}>{review&&session&&!authNeeded?'Reset password':'Forgot password'}</button>
      </>}
      {mode && (mailSent ? <div data-account-flow>
        <h2 ref={taskHeading} tabIndex={-1}>Check your email</h2>
        <p data-account-address>{email}</p>
        {notice}
        <p data-account-help>No email yet? Check your spam folder, or try again in a few minutes.</p>
        <button data-account-primary disabled={busy} onClick={()=>{returnEntry.current=mode;setMode(null);setMailSent(false);setMessage('');}}>{session&&!authNeeded?'Back to account settings':'Back to sign in'}</button>
        <div data-account-entry><button disabled={busy} onClick={()=>{setMailSent(false);setMessage('');}}>Try another email</button></div>
      </div> : <form onSubmit={requestMail} aria-label={mode==='signup'?'Invitation setup':'Password recovery'}>
        <h2 ref={taskHeading} tabIndex={-1}>{mode==='signup'?'Accept your invitation':'Reset your password'}</h2>
        {notice}
        <p>{mode==='signup'?'Enter your email and the invitation ID from your invitation.':'Enter your account email and we’ll send you a reset link.'}</p>
        <label>Email address <input required type="email" maxLength={320} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>
        {mode === 'signup' && <>
          <label>Invitation ID <input required value={invitation} onChange={e => setInvitation(e.target.value)}/></label>
          {!config.hosted&&<FictionalNotices terms={FICTIONAL_TERMS} privacy={FICTIONAL_PRIVACY}/>}
          {!config.hosted&&<label style={{display:'flex',alignItems:'flex-start'}}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/> I accept the Terms of Service and acknowledge the Privacy Policy.</label>}
        </>}
        <button data-account-primary disabled={busy || (mode === 'signup' && !config.hosted && !accepted)}>{busy?'Sending…':mode==='signup'?'Send invitation link':'Send reset link'}</button>
        {!config.hosted&&<p>Local fictional testing only. Messages stay in the local mail sink.</p>}
        <div data-account-entry><button type="button" disabled={busy} onClick={()=>{returnEntry.current=mode;setMode(null);setMessage('');}}>{session&&!authNeeded?'Cancel':'Back to sign in'}</button></div>
      </form>)}
    </div>}
  </section>;
}
function FictionalNotices({ terms, privacy }: { terms: string; privacy: string }) {
  return <div><p><strong>Fictional test notices — not legal terms.</strong></p>
    <details><summary>Terms of Service ({terms})</summary><p>This fictional local rehearsal uses synthetic accounts and data only. This notice exists to test versioned acceptance and grants no production rights.</p></details>
    <details><summary>Privacy Policy ({privacy})</summary><p>This fictional local rehearsal records your synthetic account, accepted notice versions and timestamps. It is not an approved privacy policy or a compliance claim.</p></details>
  </div>;
}
