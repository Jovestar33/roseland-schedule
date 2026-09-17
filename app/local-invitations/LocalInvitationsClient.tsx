'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { InvitationController, InvitationError, type FailureKind } from '@/lib/platform/invitation-controller';
import { createInvitationRepository, sendInvitationAttempt, type OrganizationChoice, type ProductionChoice, type PendingInvitation } from '@/lib/platform/invitation-repository';
import styles from './invitations.module.css';
import { useLocalWorkspace, useWorkspacePanelState } from '@/components/local/LocalWorkspaceContext';

const errors: Record<FailureKind, string> = {
  auth: 'Sign in again. Your draft and request are still here.',
  mfa: 'Verify a new authenticator code, then retry the same request.',
  denied: 'This action is unavailable for this account or input. Your draft is still here.',
  rate: 'Too many requests. Wait before retrying the same request; your draft is still here.',
  conflict: 'This request key already has a different or unverifiable result. Review it before starting another request.',
  unknown: 'The result is uncertain. Check for a completed result or retry the same request.',
};
type MfaStage = 'checking' | 'enroll' | 'code' | 'ready';

export default function LocalInvitationsClient({ config }: { config: LocalEditorConfig }) {
  const workspace = useLocalWorkspace();
  const managed = !!workspace;
  const active = workspace?.active ?? true;
  const [client] = useState(() => workspace?.client ?? createClient(config.supabaseUrl, config.anonymousKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch(input, init) {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== config.supabaseUrl) return Promise.reject(new Error('Local service required'));
      return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
    } },
  }));
  const [repository] = useState(() => createInvitationRepository(client));
  const [controller] = useState(() => new InvitationController(() => crypto.randomUUID()));
  const [, update] = useState(0);
  const redraw = () => update(value => value + 1);
  const epoch = useRef(0), busyRef = useRef(false), account = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false), [authNeeded, setAuthNeeded] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [mfa, setMfa] = useState<MfaStage>('checking');
  const [factor, setFactor] = useState(''), [setupKey, setSetupKey] = useState(''), [code, setCode] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]), [orgMore, setOrgMore] = useState(false);
  const [selected, setSelected] = useState('');
  const [productions, setProductions] = useState<ProductionChoice[]>([]), [productionMore, setProductionMore] = useState(false);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]), [invitationMore, setInvitationMore] = useState(false);
  const [recipient, setRecipient] = useState(''), [role, setRole] = useState('member');
  const [production, setProduction] = useState(''), [productionRole, setProductionRole] = useState('viewer'), [days, setDays] = useState(7);
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null), [reason, setReason] = useState('');
  const [message, setMessage] = useState(managed ? 'Review access for the selected fictional organization.' : 'Sign in with a fictional local account to manage invitations.');
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; label: string; action: () => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), review = useRef<HTMLElement>(null);
  const currentOrg = organizations.find(item => item.id === selected);
  const attempt = controller.attempt;
  const roleAvailable = role === 'member' || currentOrg?.role === 'owner';
  const productionAvailable = !production || productions.some(item => item.id === production);
  const dirty = !!recipient || !!reason || !!revoking || !!attempt || role !== 'member' || !!production || days !== 7;
  const ready = !!session && !authNeeded && !workspace?.authNeeded && mfa === 'ready';
  useWorkspacePanelState(dirty, busy);

  function clearDraft() { setRecipient(''); setRole('member'); setProduction(''); setProductionRole('viewer'); setDays(7); setRevoking(null); setReason(''); }
  function clearAccount() {
    epoch.current++; account.current = null; controller.bind(null); clearDraft();
    setOrganizations([]); setSelected(''); setProductions([]); setInvitations([]);
    setOrgMore(false); setProductionMore(false); setInvitationMore(false);
    setSetupKey(''); setFactor(''); setCode(''); setMfa('checking'); setConfirmation(null); redraw();
  }
  useEffect(() => {
    const generation = epoch;
    if (managed) return () => { generation.current++; controller.bind(null); };
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (next && account.current !== next.user.id) {
        clearAccount(); account.current = next.user.id; controller.bind(next.user.id);
      }
      sessionRef.current = next; setSession(next);
      if (!next && account.current) setAuthNeeded(true);
    });
    return () => { generation.current++; controller.bind(null); subscription.data.subscription.unsubscribe(); };
    // Account identity lives in refs; never subscribe with stale draft state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, controller, managed]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (confirmation && active) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation, active]);
  useEffect(() => { if (attempt && active) review.current?.focus(); }, [attempt, active]);

  function showFailure(kind: FailureKind) {
    setMessage(errors[kind]);
    if (kind === 'auth') { setAuthNeeded(true); workspace?.requireAuth(); }
    if (kind === 'mfa') { setMfa(factor ? 'code' : 'enroll'); setCode(''); }
  }
  async function run(action: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); const stamp = epoch.current;
    try { await action(); }
    catch (error) { if (stamp === epoch.current) showFailure(error instanceof InvitationError ? error.kind : 'unknown'); }
    finally { busyRef.current = false; setBusy(false); redraw(); }
  }
  async function loadOrganizations(append = false) {
    if (workspace) { const org = workspace.organization; setOrganizations(org && org.role !== 'member' ? [{ ...org, role: org.role }] : []); setOrgMore(false); return org && org.role !== 'member' ? 1 : 0; }
    const actor = account.current; if (!actor) return;
    const stamp = epoch.current;
    const page = await repository.organizations(actor, append ? organizations.at(-1)?.id : undefined);
    if (stamp !== epoch.current) return;
    setOrganizations(previous => append ? [...previous, ...page.items] : page.items); setOrgMore(page.more);
    if (!page.items.length && !append) setMessage('No organizations you can administer are available. Your draft, if any, has been retained.');
    return page.items.length;
  }
  async function loadInvitations(organization = selected, append = false) {
    const stamp = epoch.current;
    const page = await repository.pending(organization, append ? invitations.at(-1)?.id : undefined);
    if (stamp !== epoch.current) return;
    setInvitations(previous => append ? [...previous, ...page.items] : page.items); setInvitationMore(page.more);
  }
  async function loadProductions(organization = selected, append = false) {
    const stamp = epoch.current;
    const page = await repository.productions(organization, append ? productions.at(-1)?.id : undefined);
    if (stamp !== epoch.current) return;
    setProductions(previous => append ? [...previous, ...page.items] : page.items); setProductionMore(page.more);
  }
  async function inspectMfa() {
    const levels = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    const factors = await client.auth.mfa.listFactors();
    if (levels.error || factors.error || !levels.data || !factors.data) throw new InvitationError('auth');
    const verified = factors.data.totp.find(item => item.status === 'verified');
    setFactor(verified?.id ?? ''); setSetupKey(''); setCode('');
    setMfa(levels.data.currentLevel === 'aal2' ? 'ready' : verified ? 'code' : 'enroll');
    if (levels.data.currentLevel === 'aal2' && ['auth', 'mfa'].includes(controller.failure ?? '')) { controller.failure = null; redraw(); }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await client.auth.signInWithPassword({ email: sessionRef.current?.user.email ?? email, password });
      setPassword('');
      if (result.error || !result.data.session) { setMessage('Sign-in failed. Check your fictional account details.'); return; }
      setEmail(result.data.user.email ?? email); setAuthNeeded(false);
      const count = await loadOrganizations(); await inspectMfa();
      setMessage(count === 0 ? 'Signed in. No Owner/Admin organizations are available to this account.' : 'Signed in. Verify your authenticator to manage invitations.');
    } catch { setMessage('Sign-in could not finish. Your draft is retained.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!workspace) return;
    const next = workspace.session;
    if (next && account.current !== next.user.id) { clearAccount(); account.current = next.user.id; controller.bind(next.user.id); }
    sessionRef.current = next; setSession(next);
    setAuthNeeded(workspace.authNeeded); if (next) setEmail(next.user.email ?? '');
    if (!workspace.active || !workspace.session || workspace.authNeeded || !workspace.organization) return;
    const id = workspace.organization.id;
    setSelected(id);
    void run(async () => { await loadOrganizations(); await inspectMfa(); await loadProductions(id); await loadInvitations(id); });
    // Each retained management panel has one fixed organization; token changes keep its request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.session?.access_token, workspace?.authNeeded, workspace?.active, workspace?.organization?.id, workspace?.organization?.role]);
  function chooseOrganization(id: string) {
    const action = () => {
      epoch.current++; controller.clear(); clearDraft(); setSelected(id); setProductions([]); setInvitations([]);
      if (id) void run(async () => { await loadProductions(id); await loadInvitations(id); setMessage('Organization selected.'); });
    };
    if (dirty) setConfirmation({ title: 'Change organization?', text: 'Discard the current draft before changing organization.', label: 'Discard draft and change', action });
    else action();
  }
  function prepare(kind: 'create' | 'revoke') {
    try {
      controller.prepare(kind, selected, kind === 'create' ? {
        organizationId: selected, email: recipient, organizationRole: role,
        productionId: production || null, productionRole: production ? productionRole : null, expiresInDays: days,
      } : { reason }, revoking?.id ?? null);
      setMessage('Review this request before confirming.'); redraw();
    } catch { setMessage('Check the recipient, role, expiry and required reason.'); }
  }
  function discardRequest() {
    const action = () => { controller.clear(); setMessage('Local request discarded. Your draft is still here.'); redraw(); };
    if (controller.phase === 'review') action();
    else setConfirmation({ title: 'Discard local request?', text: 'This request may already have changed access. Discarding its local record does not undo it. Review its result before starting another request.', label: 'Discard local request', action });
  }

  return <div className={styles.page}><main className={styles.main}>
    <header className={styles.header}><div><span className={styles.eyebrow}>LOCAL ACCOUNT REHEARSAL</span><h1>Invitations</h1><p>Manage access for fictional organizations on this computer.</p></div><span className={styles.badge}>Local only</span></header>
    <p className={styles.notice}>Creating an invitation records access; this rehearsal does not send email. Drafts stay in this tab and are lost when it closes or reloads.</p>
    <p className={styles.status} role="status" aria-live="polite">{message}</p>
    {!workspace && (!session || authNeeded) && <section className={styles.card} aria-label="Account sign in"><h2>{account.current ? 'Sign in again' : 'Sign in'}</h2>
      {account.current && <p>Your draft and original request key are retained for this account.</p>}
      <form className={styles.form} onSubmit={login}>
        <label>Fictional account email<input type="email" required autoComplete="off" readOnly={!!account.current} value={session?.user.email ?? email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button disabled={busy}>Sign in</button>
        {account.current && !session && <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirmation({
          title: 'Clear this account’s local drafts?', text: 'Any request already sent may have completed. Check its result before clearing this tab.', label: 'Clear and use another account',
          action: () => { clearAccount(); setEmail(''); setPassword(''); setAuthNeeded(false); setMessage('Local drafts cleared. Sign in with another fictional account.'); },
        })}>Use another account</button>}
      </form></section>}
    {!workspace && session && <div className={styles.account}><span>{session.user.email} · {mfa === 'ready' && !authNeeded ? 'MFA verified' : 'Verification required'}</span>
      <button className={styles.secondary} disabled={busy} onClick={() => {
        const action = () => void run(async () => {
          const result = await client.auth.signOut({ scope: 'local' });
          if (result.error) { setMessage('Sign-out could not finish. Retry before leaving this account.'); return; }
          clearAccount(); setEmail(''); setPassword(''); setAuthNeeded(false); setMessage('Signed out. Local drafts cleared.');
        });
        if (dirty) setConfirmation({ title: 'Sign out and clear drafts?', text: 'Local drafts and request details will be cleared. A request already sent may have completed; check its result first.', label: 'Sign out and clear', action }); else action();
      }}>Sign out</button></div>}
    {session && !authNeeded && mfa !== 'ready' && organizations.length > 0 && <section className={styles.card} aria-label="Authenticator verification"><h2>{mfa === 'enroll' ? 'Set up your authenticator' : 'Verify your authenticator'}</h2>
      {mfa === 'enroll' && <><p>Add a TOTP authenticator for this fictional local account.</p><button disabled={busy} onClick={() => void run(async () => {
        const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Local invitation rehearsal' });
        if (result.error || result.data.type !== 'totp') { setMessage('Authenticator setup failed. Retry or sign in again.'); return; }
        setFactor(result.data.id); setSetupKey(result.data.totp.secret); setMfa('code'); setMessage('Add the setup key to your authenticator, then verify its six-digit code.');
      })}>Set up authenticator</button></>}
      {setupKey && <label>Authenticator setup key<input className={styles.secret} readOnly value={setupKey} autoComplete="off" /><small>For this fictional account only. The key disappears after verification.</small></label>}
      {mfa === 'code' && <form className={styles.form} onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await client.auth.mfa.challengeAndVerify({ factorId: factor, code });
        setCode('');
        if (result.error) { setMessage('Code not verified. Wait for a new six-digit code and try again.'); return; }
        await inspectMfa(); await loadOrganizations(); setMessage('Authenticator verified. Your draft and request are ready to continue.');
      }); }}><label>Six-digit authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button disabled={busy || code.length !== 6}>Verify code</button></form>}
    </section>}
    {!workspace && session && <section className={styles.card} aria-label="Organization selection"><div className={styles.sectionTitle}><h2>Organization</h2><button className={styles.secondary} disabled={busy || !ready} onClick={() => void run(() => loadOrganizations())}>Refresh organizations</button></div>
      <label>Manage invitations for<select value={selected} disabled={busy || !ready || !!attempt} onChange={event => chooseOrganization(event.target.value)}><option value="">Select an organization</option>{selected && !currentOrg && <option value={selected}>Previous selection unavailable — refresh or load more</option>}{organizations.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      {!organizations.length && <p>No Owner/Admin organizations are available to this account.</p>}
      {orgMore && <button className={styles.secondary} disabled={busy || !ready} onClick={() => void run(() => loadOrganizations(true))}>Load more organizations</button>}
    </section>}
    {selected && <div className={styles.columns}><section className={styles.card} aria-label="Invitation draft"><h2>{revoking ? 'Revoke invitation' : 'New invitation'}</h2>
      {revoking ? <form className={styles.form} onSubmit={event => { event.preventDefault(); prepare('revoke'); }}><p><strong>{revoking.email}</strong><br />{revoking.role} access</p>
        <label>Reason for revocation<textarea required maxLength={500} disabled={busy || !!attempt || !ready} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button disabled={busy || !!attempt || !ready || !currentOrg}>Review revocation</button><button type="button" className={styles.secondary} disabled={busy || !!attempt} onClick={() => { setRevoking(null); setReason(''); }}>Back to invitation draft</button>
      </form> : <form className={styles.form} onSubmit={event => { event.preventDefault(); prepare('create'); }}>
        <fieldset disabled={busy || !!attempt || !ready || !currentOrg}>
          <label>Recipient email<input type="email" required maxLength={320} autoComplete="off" value={recipient} onChange={event => setRecipient(event.target.value)} /></label>
          <label>Organization role<select value={role} onChange={event => setRole(event.target.value)}><option value="member">Member</option>{!roleAvailable && <option value={role}>{role} — no longer available</option>}{currentOrg?.role === 'owner' && <><option value="admin">Admin</option><option value="owner">Owner</option></>}</select></label>
          <label>Production access<select value={production} onChange={event => setProduction(event.target.value)}><option value="">No production assignment</option>{!productionAvailable && <option value={production}>Previous production unavailable</option>}{productions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {production && <label>Production role<select value={productionRole} onChange={event => setProductionRole(event.target.value)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="organizer">Organizer</option></select></label>}
          {productionMore && <button type="button" className={styles.secondary} onClick={() => void run(() => loadProductions(selected, true))}>Load more productions</button>}
          <label>Expires after (days)<input type="number" required min={1} max={30} value={days} onChange={event => setDays(Number(event.target.value))} /></label>
          <button disabled={!roleAvailable || !productionAvailable}>Review invitation</button>
        </fieldset>
      </form>}
    </section><section className={styles.card} aria-label="Pending invitations"><div className={styles.sectionTitle}><h2>Pending invitations</h2><button className={styles.secondary} disabled={busy || !ready} onClick={() => void run(() => loadInvitations())}>Refresh invitations</button></div>
      {!invitations.length && <p>No pending invitations in this organization.</p>}
      <ul className={styles.list}>{invitations.map(item => <li key={item.id}><div><strong>{item.email}</strong><span>{item.role}{item.productionId ? ` · ${item.productionRole} in ${productions.find(p => p.id === item.productionId)?.name ?? 'assigned production'}` : ''}</span><small>{Date.parse(item.expiresAt) <= Date.now() ? 'Expired' : 'Expires'} {new Date(item.expiresAt).toLocaleString()}</small></div>
        <button className={styles.secondary} disabled={busy || !!attempt || !ready || !currentOrg || (currentOrg.role === 'admin' && item.role !== 'member')} onClick={() => { setRevoking(item); setReason(''); }}>Revoke</button></li>)}</ul>
      {invitationMore && <button className={styles.secondary} disabled={busy || !ready} onClick={() => void run(() => loadInvitations(selected, true))}>Load more invitations</button>}
    </section></div>}
    {attempt && <section ref={review} tabIndex={-1} className={`${styles.card} ${styles.review}`} aria-label="Request review"><div className={styles.sectionTitle}><h2>{controller.phase === 'success' ? 'Result confirmed' : 'Review request'}</h2><span className={styles.badge}>{controller.phase}</span></div>
      <p><strong>{attempt.kind === 'create' ? `Invite ${attempt.body.email}` : `Revoke ${revoking?.email ?? attempt.target}`}</strong><br />{organizations.find(item => item.id === attempt.organization)?.name ?? attempt.organization}</p>
      {attempt.kind === 'create' ? <p>{String(attempt.body.organizationRole)} · {Number(attempt.body.expiresInDays)} days{attempt.body.productionId ? ` · ${attempt.body.productionRole} in ${productions.find(item => item.id === attempt.body.productionId)?.name ?? attempt.body.productionId}` : ' · no production assignment'}</p> : <p>Reason: {String(attempt.body.reason)}</p>}
      <details><summary>Request details</summary><p className={styles.identifier}>Request key: {attempt.key}</p>{controller.result && <p className={styles.identifier}>Invitation: {controller.result.id}</p>}</details>
      {controller.failure && <p role="alert">{errors[controller.failure]}</p>}
      {controller.result && <p>{controller.result.description}{!controller.result.matches && ' — this does not match the current request.'}</p>}
      <div className={styles.actions}>
        {controller.phase !== 'success' && controller.phase !== 'conflict' && <button disabled={busy || !ready} onClick={() => void run(async () => {
          const operation = controller.submit(value => sendInvitationAttempt(value, sessionRef.current)); redraw(); await operation;
          if (controller.failure) showFailure(controller.failure);
          if (controller.phase === 'success') { setMessage('Operation confirmed. Review the result below.'); await loadInvitations(); }
        })}>{controller.phase === 'review' ? (attempt.kind === 'create' ? 'Confirm invitation' : 'Confirm revocation') : 'Retry same request'}</button>}
        {controller.phase !== 'review' && controller.phase !== 'success' && <button className={styles.secondary} disabled={busy || !ready} onClick={() => void run(async () => {
          const operation = controller.check(value => repository.result(value)); redraw(); await operation;
          if (controller.failure === 'auth' || controller.failure === 'mfa') showFailure(controller.failure);
          else setMessage(controller.result ? 'Completed result found. Review it below.' : 'No matching completed result is visible. Keep the same request when retrying.');
          if (controller.phase === 'success') await loadInvitations();
        })}>Check result</button>}
        {controller.phase === 'success' ? <button disabled={busy} onClick={() => {
          if (attempt.kind === 'create') { setRecipient(''); setRole('member'); setProduction(''); setDays(7); }
          else { setRevoking(null); setReason(''); }
          controller.clear(); redraw(); setMessage('Result acknowledged. You can prepare another request.');
        }}>Acknowledge result</button> : <button className={styles.secondary} disabled={busy} onClick={discardRequest}>{controller.phase === 'review' ? 'Back to draft' : 'Discard local request'}</button>}
      </div>
    </section>}
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setConfirmation(null)} aria-label={confirmation?.title ?? 'Confirm action'}><h2>{confirmation?.title}</h2><p>{confirmation?.text}</p><div className={styles.actions}><button className={styles.secondary} onClick={() => setConfirmation(null)}>Keep working</button><button onClick={() => { const action = confirmation?.action; setConfirmation(null); action?.(); }}>{confirmation?.label}</button></div></dialog>
  </main></div>;
}
