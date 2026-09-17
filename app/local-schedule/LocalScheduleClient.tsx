'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { createSessionScheduleRepository, type ScheduleSummary } from '@/lib/platform/session-schedule-repository';
import { createSaveRecoveryRepository } from '@/lib/platform/schedule-save-recovery';
import { LocalEditorController } from '@/lib/platform/local-editor-controller';
import { ScheduleRepositoryError } from '@/lib/platform/schedule-repository';
import { makeMeta } from '@/lib/rowNormalizer';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { LocalEditorContext } from '@/components/schedule/LocalEditorContext';
import ScheduleHeader from '@/components/schedule/ScheduleHeader';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import UndoRedoButtons from '@/components/toolbar/UndoRedoButtons';
import ContactModal from '@/components/modals/ContactModal';
import StatusModal from '@/components/modals/StatusModal';
import NotesModal from '@/components/modals/NotesModal';
import { ModalVisibilityContext } from '@/components/modals/Modal';
import styles from './local.module.css';
import { useLocalWorkspace, useWorkspacePanelState } from '@/components/local/LocalWorkspaceContext';
import { createWorkspaceRepository } from '@/lib/platform/workspace-repository';
import ScheduleReadView from '@/components/view/ScheduleReadView';
import ShareDropdown from '@/components/toolbar/ShareDropdown';
import LocalWeatherControls from '@/components/local/LocalWeatherControls';
import LocalSchedulePrint from '@/components/local/LocalSchedulePrint';
import { DocumentProvidersContext } from '@/components/local/DocumentProvidersContext';
import { fictionalDocumentProviders } from '@/lib/platform/document-providers';

export default function LocalScheduleClient({ config }: { config: LocalEditorConfig }) {
  const workspace = useLocalWorkspace();
  const managed = !!workspace;
  const active = workspace?.active ?? true;
  const [client] = useState(() => workspace?.client ?? createClient(config.supabaseUrl, config.anonymousKey, {
    global: { fetch: (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== config.supabaseUrl) return Promise.reject(new Error('Local request required'));
      return fetch(input, { ...init, redirect: 'error' });
    } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  const [repository] = useState(() => createSessionScheduleRepository(client));
  const [directory] = useState(() => createWorkspaceRepository(client));
  const accountRef = useRef<string | null>(null);
  const [permission, setPermission] = useState<{ recordId: string; token: string; allowed: boolean } | null>(null);
  const scopeRef = useRef<string | null>(null), listTicket = useRef(0);
  scopeRef.current = workspace?.organization?.id ?? null;
  const [itemsOrganization, setItemsOrganization] = useState<string | null>(null);
  const [controller] = useState(() => new LocalEditorController(createSaveRecoveryRepository(client, () => accountRef.current), {
    getState: useScheduleStore.getState,
    load(record) {
      const doc = record.document;
      useScheduleStore.getState().loadSchedule(record.display_name, {
        rows: doc.rows ?? [], meta: makeMeta(doc.meta), savedAt: doc.savedAt ?? 0,
      });
    },
  }));
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const epoch = useRef(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [items, setItems] = useState<ScheduleSummary[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState(managed ? 'Choose an authorized organization above.' : 'Sign in with a fictional local account.');
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ label: string; action: () => void; scope: string | null } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [contact, setContact] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [notes, setNotes] = useState<number | null>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const documentSession = useScheduleStore(s => s.documentSession);
  const dirty = useScheduleStore(s => s.dirty);
  const rows = useScheduleStore(s => s.rows);
  const state = useScheduleStore.getState;
  const hasLocalDraft = dirty || documentDialogOpen || contact !== null || status !== null || notes !== null || controller.attempt !== null;
  useWorkspacePanelState(hasLocalDraft, busy);
  const ready = !!session && !authNeeded && !workspace?.authNeeded;
  const recordInScope = !workspace || (!!workspace.organization && controller.record?.organization_id === workspace.organization.id);
  const canEdit = !workspace || (permission?.recordId === controller.record?.id && permission?.token === workspace.session?.access_token && permission?.allowed === true);

  // A fresh provider identity invalidates pending selections when document/account scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const documentProviders = useMemo(() => ({...fictionalDocumentProviders}), [documentSession, workspace?.organization?.id, session?.user.id]);

  useEffect(() => {
    const requestEpoch = epoch, requests = listTicket;
    if (managed) return () => { requestEpoch.current++; requests.current++; controller.invalidate(); };
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (sessionRef.current?.access_token !== next?.access_token) {
        const sameAccount = !!next && accountRef.current === next.user.id;
        epoch.current++;
        if (next) {
          accountRef.current = next.user.id;
          if (sameAccount) controller.suspend(); else controller.bind(next.user.id);
        } else controller.suspend();
        setItems([]); setMore(false); setConfirmation(null);
        if (next && !sameAccount) {
          // Account changes clear all prior document and modal state.
          setContact(null); setStatus(null); setNotes(null);
          setSelected(null); setVersion(null); state().newSchedule();
        }
        setAuthNeeded(!next && !!accountRef.current);
        busyRef.current = false; setBusy(false);
      }
      sessionRef.current = next;
      setSession(next);
    });
    return () => { requestEpoch.current++; controller.invalidate(); subscription.data.subscription.unsubscribe(); };
  }, [client, controller, state, managed]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (hasLocalDraft) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasLocalDraft]);

  useEffect(() => {
    if (confirmation && active && confirmation.scope === scopeRef.current) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirmation, active, workspace?.organization?.id]);

  function guarded(action: () => void, label: string) {
    if (state().dirty || documentDialogOpen || contact !== null || status !== null || notes !== null || controller.attempt) setConfirmation({ label, action, scope: scopeRef.current }); else action();
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const requestEpoch = epoch.current;
    try { await action(); }
    catch (error) {
      if (requestEpoch === epoch.current) {
        setMessage(error instanceof ScheduleRepositoryError ? error.message : 'Request failed. Please try again.');
        if (error instanceof ScheduleRepositoryError && error.kind === 'unauthenticated') { setAuthNeeded(true); workspace?.requireAuth(); }
      }
    } finally { if (requestEpoch === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function list(append: boolean) {
    const requestEpoch = epoch.current, ticket = ++listTicket.current, organization = scopeRef.current;
    if (workspace && (!organization || !accountRef.current)) { setItems([]); setMore(false); return; }
    const page = workspace ? await directory.schedules(accountRef.current!, organization!, append ? items.at(-1)?.id ?? null : null) : await repository.list(append ? items.at(-1)?.id ?? null : null);
    if (requestEpoch !== epoch.current || ticket !== listTicket.current || organization !== scopeRef.current) return;
    setItemsOrganization(organization); setItems(previous => append ? [...previous, ...page] : page);
    setMore(page.length === 50);
    setMessage(page.length || append ? 'Schedules loaded.' : 'No schedules are available to this account.');
  }
  async function refreshPermission() {
    const record = controller.record, actor = accountRef.current, token = sessionRef.current?.access_token;
    const requestEpoch = epoch.current, organization = scopeRef.current;
    if (!workspace || !record || !actor || !token || record.organization_id !== organization) return;
    const allowed = await directory.canEdit(actor, record.production_id);
    if (requestEpoch === epoch.current && controller.record?.id === record.id && sessionRef.current?.access_token === token && scopeRef.current === organization) setPermission({ recordId: record.id, token, allowed });
  }
  async function open(id: string) {
    if (await controller.open(id)) {
      setSelected(id); setVersion(controller.record!.document_version);
      setContact(null); setStatus(null); setNotes(null);
      setMessage('Schedule loaded.');
      await refreshPermission();
    }
  }
  useEffect(() => {
    if (!workspace) return;
    const next = workspace.session;
    if (next) { accountRef.current = next.user.id; controller.bind(next.user.id); }
    sessionRef.current = next; setSession(next); setAuthNeeded(workspace.authNeeded);
    if (next) setEmail(next.user.email ?? '');
    const ticket = ++listTicket.current, requestEpoch = epoch.current;
    if (!workspace.active || !next || workspace.authNeeded || !workspace.organization) return;
    // Directory reads may overlap a retained write, but may only update the current scope.
    void list(false).then(refreshPermission).catch(error => {
      if (requestEpoch !== epoch.current || listTicket.current !== ticket + 1) return;
      setMessage(error instanceof ScheduleRepositoryError ? error.message : 'Schedule access could not be refreshed.');
      if (error instanceof ScheduleRepositoryError && error.kind === 'unauthenticated') workspace.requireAuth();
    });
    // Navigation retains the document, undo history and in-flight operation identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.session?.access_token, workspace?.authNeeded, workspace?.organization?.id, workspace?.active]);
  useEffect(() => {
    const request = workspace?.scheduleRequest;
    if (!request || !workspace.active || !ready || busy || request.organization !== workspace.organization?.id) return;
    workspace.consumeScheduleRequest(request.sequence);
    guarded(() => void run(() => open(request.id)), 'Open saved result and discard unsaved changes');
    // One account-bound request opens only after the editor is ready; normal discard guards apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.scheduleRequest?.sequence, workspace?.active, workspace?.organization?.id, ready, busy]);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await client.auth.signInWithPassword({ email, password });
      setPassword('');
      if (result.error || !result.data.session) { setMessage('Sign-in failed. Check your local account details.'); return; }
      await list(false);
    } catch { setMessage('Sign-in failed. Check the local service.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <LocalEditorContext.Provider value={true}>
    <DocumentProvidersContext.Provider value={active && recordInScope && ready && canEdit && !confirmation ? documentProviders : null}>
    <main className={styles.main}>
      <header className={styles.banner}>
        <h1>Local schedule rehearsal</h1>
        <p>Fictional data only · Supabase on this computer</p>
        <p>Authenticated editing and document tools with fictional location and weather responses. Library parity review remains open.</p>
      </header>
      <p role="status" aria-live="polite">{message}</p>
      {!workspace && (!session || authNeeded) && <form className={styles.login} onSubmit={login}>
        {authNeeded && <p>Sign in again to continue. Your edits are still here.</p>}
        <label>Email<input type="email" autoComplete="off" required readOnly={!!session} value={session?.user.email ?? email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy}>Sign in</button>
      </form>}
      {(session || (managed && accountRef.current)) && <>
        <div className={styles.toolbar}>
          {!workspace && session && <span>Signed in as {session.user.email}</span>}
          {!workspace && <button className="btn btn-light" disabled={busy} onClick={() => guarded(() => void run(async () => {
            const result = await client.auth.signOut({ scope: 'local' });
            if (result.error) throw new Error('Sign-out failed');
            controller.invalidate(); accountRef.current = null; setSelected(null); setVersion(null); setContact(null); setStatus(null); setNotes(null); state().newSchedule(); setAuthNeeded(false);
            setMessage('Signed out.');
          }), 'Sign out and discard unsaved changes')}>Sign out</button>}
          <button className="btn btn-light" disabled={busy || !ready} onClick={() => void run(() => list(false))}>Refresh list</button>
        </div>
        <nav aria-label="Local schedules" className={styles.list}>
          {workspace && !workspace.organization && <p>Choose an authorized organization above.</p>}
          {selected && !recordInScope && <p>A schedule draft is retained in another organization. Return to that organization to continue, or explicitly discard it when opening another schedule.</p>}
          {(!workspace || itemsOrganization === workspace.organization?.id ? items : []).map(item => <button key={item.id} className="btn btn-light" disabled={busy || !ready} aria-current={selected === item.id ? 'page' : undefined}
            onClick={() => guarded(() => void run(() => open(item.id)), 'Open schedule and discard unsaved changes')}>
            {item.display_name} · {item.status}
          </button>)}
          {more && (!workspace || itemsOrganization === workspace.organization?.id) && <button className="btn btn-light" disabled={busy} onClick={() => void run(() => list(true))}>Load more schedules</button>}
        </nav>
        {selected && <section className="panel" aria-label="Schedule editor" style={{display:recordInScope?undefined:'none'}}>
          <div className={styles.toolbar}>
            <strong>{state().scheduleName}</strong><span>Version {version} · {dirty ? 'Unsaved changes' : 'Saved'}</span>
            <button className="btn btn-primary" disabled={busy || !dirty || !ready || !canEdit || !!controller.attempt} onClick={() => void run(async () => {
              if (await controller.save()) { setVersion(controller.record!.document_version); setMessage(state().dirty ? 'Saved earlier edits. Newer edits remain unsaved.' : 'Schedule saved.'); }
            })}>Save schedule</button>
            <button className="btn btn-light" disabled={busy} onClick={() => guarded(() => void run(() => open(selected)), 'Reload and discard unsaved changes')}>Reload schedule</button>
            {canEdit && ready && <UndoRedoButtons />}
          </div>
          <ModalVisibilityContext.Provider value={active && recordInScope && ready && !confirmation}>
            <div className={styles.toolbar}><ShareDropdown key={documentSession} readOnly={!canEdit || !ready || !active || !recordInScope || !!confirmation} onModalChange={setDocumentDialogOpen} /></div>
          </ModalVisibilityContext.Provider>
          <LocalSchedulePrint visible={active && recordInScope && ready && !confirmation} />
          {(controller.attempt || controller.result) && <section className={styles.recovery} aria-label="Save recovery">
            <h2>{controller.result?.state === 'matched' ? 'Saved version confirmed' : 'Save needs review'}</h2>
            <p>{controller.result?.state === 'matched'
              ? `Your attempted document matches saved version ${controller.result.saved!.document_version}. ${controller.attempt ? `The current schedule is version ${controller.result.currentVersion}; your draft is retained. Review or reload before saving again.` : 'Newer local edits, if any, remain unsaved.'}`
              : controller.result?.state === 'retryable' ? 'The original saved version is still current. You can retry the exact attempted document; newer edits stay in your draft.'
              : controller.result?.state === 'different' ? 'The saved schedule changed. Your attempted document was not confirmed. Your draft is retained; do not overwrite the newer version.'
              : controller.result?.state === 'unavailable' ? 'The schedule is unavailable to this account. That does not establish whether your save committed. Your draft and attempted save are retained.'
              : 'The save result is not confirmed. Your draft and exact attempted document are retained. Check the saved result before retrying.'}</p>
            {controller.attempt && <><p>Attempted from version {controller.attempt.before.document_version}. Checking does not replace your draft.</p>
              <button className="btn btn-light" disabled={busy || !ready} onClick={() => void run(async () => { if (await controller.recover()) { setVersion(controller.record!.document_version); setMessage('Saved-result check completed. Review the recovery status.'); } })}>Check saved result</button>
              <button className="btn btn-light" disabled={busy || !ready || !canEdit || controller.result?.state !== 'retryable'} onClick={() => void run(async () => { if (await controller.recover(true)) { setVersion(controller.record!.document_version); setMessage('Retry checked against the original saved version. Review the recovery status.'); } })}>Retry exact save</button>
            </>}
          </section>}
          {!canEdit && <><p>Read-only schedule access.</p><ScheduleReadView data={state().getScheduleData()} name={state().scheduleName ?? undefined}/></>}
          <ModalVisibilityContext.Provider value={active && recordInScope && ready && canEdit && !confirmation}>
          <fieldset disabled={!ready || !canEdit} style={{border:0,padding:0,minWidth:0,display:canEdit?undefined:'none'}}>
          <ScheduleHeader />
          <LocalWeatherControls enabled={active && recordInScope && ready && canEdit && !confirmation} scope={`${accountRef.current}:${controller.record?.id}`} />
          <ScheduleGrid onOpenContact={setContact} onOpenStatus={setStatus} onOpenNotes={setNotes} />
          <div className="add-area"><button className="btn btn-light" onClick={() => { state().pushUndo(); state().addRowAfter(rows.length - 1); }}>+ Add Row</button></div>
          <ContactModal open={contact !== null} row={contact !== null ? rows[contact] : null} onClose={() => setContact(null)}
            onSave={patch => { if (contact !== null) { state().pushUndo(); state().updateRow(contact, patch); } }} />
          <StatusModal open={status !== null} row={status !== null ? rows[status] : null} onClose={() => setStatus(null)}
            onSave={value => { if (status !== null) { state().pushUndo(); state().updateRow(status, { status: value }); } }}
            onClear={() => { if (status !== null) { state().pushUndo(); state().updateRow(status, { status: '' }); } }} />
          <NotesModal open={notes !== null} notes={notes !== null ? rows[notes]?.notes ?? '' : ''} onClose={() => setNotes(null)}
            onSave={value => { if (notes !== null) { state().pushUndo(); state().updateRow(notes, { notes: value }); } }} />
          </fieldset>
          </ModalVisibilityContext.Provider>
        </section>}
      </>}
      <dialog ref={dialogRef} onCancel={() => setConfirmation(null)} aria-label="Discard unsaved changes" className={styles.confirm}>
        <p>Your unsaved edits and retained save attempt will be discarded. A sent save may already have committed; discarding does not undo it.</p>
        <button className="btn btn-light" onClick={() => setConfirmation(null)}>Keep editing</button>
        <button className="btn btn-primary" onClick={() => { const action = confirmation?.action; setConfirmation(null); action?.(); }}>{confirmation?.label}</button>
      </dialog>
    </main>
    </DocumentProvidersContext.Provider>
  </LocalEditorContext.Provider>;
}
