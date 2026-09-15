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
import styles from './local.module.css';

export default function LocalScheduleClient({ config }: { config: LocalEditorConfig }) {
  const [client] = useState(() => createClient(config.supabaseUrl, config.anonymousKey, {
    global: { fetch: (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== config.supabaseUrl) return Promise.reject(new Error('Local request required'));
      return fetch(input, { ...init, redirect: 'error' });
    } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  const [repository] = useState(() => createSessionScheduleRepository(client));
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
  const [message, setMessage] = useState('Sign in with a fictional local account.');
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

  useEffect(() => {
    const requestEpoch = epoch;
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (sessionRef.current?.access_token !== next?.access_token) {
        const sameAccount = next && sessionRef.current?.user.id === next.user.id;
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
  }, [client, controller, state]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    if (confirmation) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirmation]);

  function guarded(action: () => void, label: string) {
    if (state().dirty) setConfirmation({ label, action }); else action();
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const requestEpoch = epoch.current;
    try { await action(); }
    catch (error) {
      if (requestEpoch === epoch.current) {
        setMessage(error instanceof ScheduleRepositoryError ? error.message : 'Request failed. Please try again.');
        if (error instanceof ScheduleRepositoryError && error.kind === 'unauthenticated') setAuthNeeded(true);
      }
    } finally { if (requestEpoch === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function list(append: boolean) {
    const requestEpoch = epoch.current;
    const page = await repository.list(append ? items.at(-1)?.id ?? null : null);
    if (requestEpoch !== epoch.current) return;
    setItems(previous => append ? [...previous, ...page] : page);
    setMore(page.length === 50);
    setMessage(page.length || append ? 'Schedules loaded.' : 'No schedules are available to this account.');
  }
  async function open(id: string) {
    if (await controller.open(id)) {
      setSelected(id); setVersion(controller.record!.document_version);
      setContact(null); setStatus(null); setNotes(null);
      setMessage('Schedule loaded.');
    }
  }
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
      {(!session || authNeeded) && <form className={styles.login} onSubmit={login}>
        {authNeeded && <p>Sign in again to continue. Your edits are still here.</p>}
        <label>Email<input type="email" autoComplete="off" required readOnly={!!session} value={session?.user.email ?? email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy}>Sign in</button>
      </form>}
      {session && <>
        <div className={styles.toolbar}>
          <span>Signed in as {session.user.email}</span>
          <button className="btn btn-light" disabled={busy} onClick={() => guarded(() => void run(async () => {
            const result = await client.auth.signOut({ scope: 'local' });
            if (result.error) throw new Error('Sign-out failed');
            setMessage('Signed out.');
          }), 'Sign out and discard unsaved changes')}>Sign out</button>
          <button className="btn btn-light" disabled={busy} onClick={() => void run(() => list(false))}>Refresh list</button>
        </div>
        <nav aria-label="Local schedules" className={styles.list}>
          {items.map(item => <button key={item.id} className="btn btn-light" disabled={busy} aria-current={selected === item.id ? 'page' : undefined}
            onClick={() => guarded(() => void run(() => open(item.id)), 'Open schedule and discard unsaved changes')}>
            {item.display_name} · {item.status}
          </button>)}
          {more && <button className="btn btn-light" disabled={busy} onClick={() => void run(() => list(true))}>Load more schedules</button>}
        </nav>
        {selected && <section className="panel" aria-label="Schedule editor">
          <div className={styles.toolbar}>
            <strong>{state().scheduleName}</strong><span>Version {version} · {dirty ? 'Unsaved changes' : 'Saved'}</span>
            <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void run(async () => {
              if (await controller.save()) { setVersion(controller.record!.document_version); setMessage(state().dirty ? 'Saved earlier edits. Newer edits remain unsaved.' : 'Schedule saved.'); }
            })}>Save schedule</button>
            <button className="btn btn-light" disabled={busy} onClick={() => guarded(() => void run(() => open(selected)), 'Reload and discard unsaved changes')}>Reload schedule</button>
            <UndoRedoButtons />
          </div>
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
