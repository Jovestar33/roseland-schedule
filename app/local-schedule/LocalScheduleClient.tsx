'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { LocalEditorConfig } from '@/lib/platform/local-editor-config';
import { createSessionScheduleRepository, type ScheduleSummary } from '@/lib/platform/session-schedule-repository';
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
  const [controller] = useState(() => new LocalEditorController(repository, {
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
  const [confirmation, setConfirmation] = useState<{ label: string; action: () => void } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [contact, setContact] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [notes, setNotes] = useState<number | null>(null);
  const dirty = useScheduleStore(s => s.dirty);
  const rows = useScheduleStore(s => s.rows);
  const state = useScheduleStore.getState;
  const hasLocalDraft = dirty || contact !== null || status !== null || notes !== null;
  useWorkspacePanelState(hasLocalDraft, busy);
  const ready = !!session && !authNeeded && !workspace?.authNeeded;
  const recordInScope = !workspace || (!!workspace.organization && controller.record?.organization_id === workspace.organization.id);
  const canEdit = !workspace || (permission?.recordId === controller.record?.id && permission?.token === workspace.session?.access_token && permission?.allowed === true);

  useEffect(() => {
    const requestEpoch = epoch, requests = listTicket;
    if (managed) return () => { requestEpoch.current++; requests.current++; controller.invalidate(); };
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (sessionRef.current?.access_token !== next?.access_token) {
        const sameAccount = next && accountRef.current === next.user.id;
        if (next) accountRef.current = next.user.id;
        const previousRecord = controller.record;
        epoch.current++;
        controller.invalidate();
        setItems([]); setMore(false); setConfirmation(null);
        setContact(null); setStatus(null); setNotes(null);
        if (sameAccount) controller.record = previousRecord;
        else {
          // Never carry a previous account's document/undo history across sessions.
          setSelected(null); setVersion(null); state().newSchedule();
        }
        setAuthNeeded(false);
        if (!next) { busyRef.current = false; setBusy(false); }
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
    if (confirmation && active) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirmation, active]);

  function guarded(action: () => void, label: string) {
    if (state().dirty || contact !== null || status !== null || notes !== null) setConfirmation({ label, action }); else action();
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
    if (next) accountRef.current = next.user.id;
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
    <main className={styles.main}>
      <header className={styles.banner}>
        <h1>Local schedule rehearsal</h1>
        <p>Fictional data only · Supabase on this computer</p>
        <p>Account login, schedule selection and editing. Other library tools and online lookups are not available here.</p>
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
            <button className="btn btn-primary" disabled={busy || !dirty || !ready || !canEdit} onClick={() => void run(async () => {
              if (await controller.save()) { setVersion(controller.record!.document_version); setMessage(state().dirty ? 'Saved earlier edits. Newer edits remain unsaved.' : 'Schedule saved.'); }
            })}>Save schedule</button>
            <button className="btn btn-light" disabled={busy} onClick={() => guarded(() => void run(() => open(selected)), 'Reload and discard unsaved changes')}>Reload schedule</button>
            {canEdit && ready && <UndoRedoButtons />}
          </div>
          {!canEdit && <><p>Read-only schedule access.</p><ScheduleReadView data={state().getScheduleData()} name={state().scheduleName ?? undefined}/></>}
          <ModalVisibilityContext.Provider value={active && recordInScope && ready && canEdit}>
          <fieldset disabled={!ready || !canEdit} style={{border:0,padding:0,minWidth:0,display:canEdit?undefined:'none'}}>
          <ScheduleHeader />
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
        <p>Your unsaved edits will be discarded.</p>
        <button className="btn btn-light" onClick={() => setConfirmation(null)}>Keep editing</button>
        <button className="btn btn-primary" onClick={() => { const action = confirmation?.action; setConfirmation(null); action?.(); }}>{confirmation?.label}</button>
      </dialog>
    </main>
  </LocalEditorContext.Provider>;
}
