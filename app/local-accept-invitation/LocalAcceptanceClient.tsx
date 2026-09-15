'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { AcceptanceController, type AcceptanceFailure } from '@/lib/platform/acceptance-controller';
import { createAcceptanceRepository } from '@/lib/platform/acceptance-repository';
import styles from '../local-invitations/invitations.module.css';
import { useLocalWorkspace, useWorkspacePanelState } from '@/components/local/LocalWorkspaceContext';

const errors: Record<AcceptanceFailure, string> = {
  auth: 'Sign in again with the same account. Your invitation ID and review are retained.',
  unavailable: 'This invitation is unavailable for this account. If an earlier attempt may have completed, check its result.',
  unknown: 'Acceptance is uncertain. Check the result or retry the same invitation.',
};
export default function LocalAcceptanceClient({ config }: { config: LocalEditorConfig }) {
  const workspace = useLocalWorkspace();
  const managed = !!workspace;
  const active = workspace?.active ?? true;
  const [client] = useState(() => workspace?.client ?? createClient(config.supabaseUrl, config.anonymousKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch(input, init) {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== config.supabaseUrl) return Promise.reject(new Error('Local service required'));
      return fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    } },
  }));
  const [controller] = useState(() => new AcceptanceController());
  const [repository] = useState(() => createAcceptanceRepository(client));
  const [, redraw] = useState(0);
  const refresh = () => redraw(value => value + 1);
  const account = useRef<string | null>(null), sessionRef = useRef<Session | null>(null), busyRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [invitationId, setInvitationId] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(managed ? 'Review the invitation ID supplied for this fictional account.' : 'Sign in with the fictional account that received the invitation.');
  const [confirmClear, setConfirmClear] = useState<'signout' | 'review' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), review = useRef<HTMLElement>(null);
  const dirty = !!invitationId || !!controller.attempt;
  const ready = !!session && !authNeeded && !workspace?.authNeeded;
  useWorkspacePanelState(dirty, busy);
  function clearAccount() {
    account.current = null; controller.bind(null); setInvitationId(''); setPassword(''); setEmail(''); setAuthNeeded(false); refresh();
  }
  useEffect(() => {
    if (managed) return () => { controller.bind(null); };
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (next && account.current !== next.user.id) { clearAccount(); account.current = next.user.id; controller.bind(next.user.id); }
      sessionRef.current = next; setSession(next);
      if (!next && account.current) setAuthNeeded(true);
    });
    return () => { controller.bind(null); subscription.data.subscription.unsubscribe(); };
    // The account and operation identity are held in refs/controller, not stale draft closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, controller, managed]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (confirmClear && active) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmClear, active]);
  useEffect(() => { if (controller.attempt && active) review.current?.focus(); }, [controller.attempt, active]);
  useEffect(() => {
    if (!workspace) return;
    const next = workspace.session;
    if (next && account.current !== next.user.id) { clearAccount(); account.current = next.user.id; controller.bind(next.user.id); }
    sessionRef.current = next; setSession(next); setAuthNeeded(workspace.authNeeded);
    if (next) setEmail(next.user.email ?? '');
    if (!workspace.authNeeded && controller.failure === 'auth') { controller.failure = null; refresh(); }
    // Shared session updates retain this actor's immutable invitation, including during reauthentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.authNeeded, workspace?.session?.access_token, controller]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await client.auth.signInWithPassword({ email: sessionRef.current?.user.email ?? email, password });
      setPassword('');
      if (result.error || !result.data.session) { setMessage('Sign-in failed. Check your fictional account details.'); return; }
      setEmail(result.data.user.email ?? email); setAuthNeeded(false);
      if (controller.failure === 'auth') controller.failure = null;
      setMessage('Signed in. Review the fictional invitation ID before accepting.'); refresh();
    } catch { setPassword(''); setMessage('Sign-in could not finish. Your draft is retained.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function execute(checkOnly: boolean) {
    if (!ready || busyRef.current) return;
    busyRef.current = true; setBusy(true); const attempt = controller.attempt;
    try {
      const operation = controller.execute(repository, checkOnly); refresh(); await operation;
      if (controller.attempt !== attempt) return;
      if (controller.failure) { setMessage(errors[controller.failure]); if (controller.failure === 'auth') { setAuthNeeded(true); workspace?.requireAuth(); } }
      else setMessage(controller.phase === 'success' ? 'Acceptance confirmed. Review the result below.' : 'No completed acceptance is visible for this account. This does not prove an earlier request failed. Keep the same invitation ID.');
    } finally { busyRef.current = false; setBusy(false); refresh(); }
  }
  async function signOut() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      if (sessionRef.current) {
        const result = await client.auth.signOut({ scope: 'local' });
        if (result.error) { setMessage('Sign-out could not finish. Retry before changing account.'); return; }
      }
      clearAccount(); setConfirmClear(null); setMessage('Signed out. Local invitation details cleared.');
    } catch { setMessage('Sign-out could not finish. Local invitation details are retained.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const attempt = controller.attempt;
  return <div className={styles.page}><main className={styles.main}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL ACCOUNT REHEARSAL</span><h1>Accept an invitation</h1><p>Join a fictional organization using its supplied invitation ID.</p></div><span className={styles.badge}>Local only</span></header>
    <p className={styles.notice}>Use only fictional accounts and invitation IDs. This rehearsal sends no email. Drafts stay in this tab and are lost when it closes or reloads.</p>
    <p className={styles.status} role="status" aria-live="polite">{message}</p>
    {!workspace && (!session || authNeeded) && <section className={styles.card} aria-label="Account sign in"><h2>{account.current ? 'Sign in again' : 'Sign in'}</h2>
      {account.current && <p>Your invitation ID and review are retained for this account.</p>}
      <form className={styles.form} onSubmit={login}><label>Fictional account email<input type="email" required autoComplete="off" readOnly={!!account.current} value={session?.user.email ?? email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label><button disabled={busy}>Sign in</button>
      </form>
      {account.current && !session && <button className={styles.secondary} disabled={busy} onClick={() => setConfirmClear('signout')}>Use another account</button>}
    </section>}
    {!workspace && session && <div className={styles.account}><span>{session.user.email}</span><button className={styles.secondary} disabled={busy} onClick={() => dirty ? setConfirmClear('signout') : void signOut()}>Sign out</button></div>}
    {account.current && <section className={styles.card} aria-label="Invitation draft"><h2>Invitation ID</h2>
      <p>Enter the ID supplied for this fictional account. Confirm the invitation with its sender before accepting.</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!ready || busyRef.current) return; try { controller.prepare(invitationId); setMessage('Review the invitation and account before confirming.'); refresh(); } catch { setMessage('Enter a valid invitation ID. Your draft is retained.'); } }}>
        <label>Fictional invitation ID<input required autoComplete="off" maxLength={36} disabled={!ready || busy || !!attempt} value={invitationId} onChange={event => setInvitationId(event.target.value)} /></label>
        <button disabled={!ready || busy || !!attempt}>Review invitation</button>
      </form>
    </section>}
    {attempt && <section ref={review} tabIndex={-1} className={`${styles.card} ${styles.review}`} aria-label="Acceptance review">
      <h2>{controller.phase === 'success' ? 'Acceptance confirmed' : 'Review acceptance'}</h2>
      <p>Account: <strong>{session?.user.email ?? email}</strong></p><p className={styles.identifier}>Invitation: {attempt.invitationId}</p>
      {controller.failure && <p role="alert">{errors[controller.failure]}</p>}
      {controller.receipt && <><p>Invitation accepted. Access may change if an administrator changes your membership.</p><p className={styles.identifier}>Organization: {controller.receipt.organizationId}</p>{controller.receipt.acceptedAt && <p>Accepted {new Date(controller.receipt.acceptedAt).toLocaleString()}</p>}</>}
      <div className={styles.actions}>
        {workspace && controller.receipt && <button disabled={busy || !ready} onClick={() => workspace.openOrganization(controller.receipt!.organizationId)}>Open organization schedules</button>}
        {controller.phase === 'success' ? <button disabled={busy} onClick={() => { controller.clear(); setInvitationId(''); refresh(); setMessage('Result acknowledged. You can review another fictional invitation.'); }}>Acknowledge result</button> : <>
          <button disabled={!ready || busy} onClick={() => void execute(false)}>{controller.phase === 'review' ? 'Confirm acceptance' : 'Retry same invitation'}</button>
          <button className={styles.secondary} disabled={!ready || busy} onClick={() => void execute(true)}>Check acceptance result</button>
          {controller.phase !== 'review' && <button className={styles.secondary} disabled={busy} onClick={() => setConfirmClear('review')}>Discard local review</button>}
          {controller.phase === 'review' && <button className={styles.secondary} disabled={busy} onClick={() => { controller.clear(); refresh(); setMessage('Review closed. Your invitation ID is still here.'); }}>Back to draft</button>}
        </>}
      </div>
      {controller.phase !== 'success' && controller.phase !== 'review' && <p>Keep this invitation ID when retrying. To review another invitation, explicitly discard this local review. Sign out to use a different account. Clearing the review does not undo accepted access.</p>}
    </section>}
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setConfirmClear(null)} aria-label="Clear local acceptance details"><h2>{confirmClear === 'review' ? 'Discard this local review?' : 'Sign out and clear this review?'}</h2><p>An earlier acceptance may have completed. Clearing this tab does not undo access. Check its result before continuing.</p><div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setConfirmClear(null)}>Keep working</button><button disabled={busy} onClick={() => { if (confirmClear === 'review') { controller.clear(); setConfirmClear(null); refresh(); setMessage('Local review discarded. Your invitation ID is still here. Any accepted access is unchanged.'); } else void signOut(); }}>{confirmClear === 'review' ? 'Discard local review' : 'Sign out and clear'}</button></div></dialog>
  </main></div>;
}
