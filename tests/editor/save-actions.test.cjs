const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceLoader } = require('./source-loader.cjs');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const requests = [], loads = [], snapshots = [], routes = [], cleanups = [];
  const mocks = {
    react: { useRef: current => ({ current }), useEffect: effect => cleanups.push(effect()) },
    'next/navigation': { useRouter: () => ({ push: url => routes.push(url), refresh() {} }) },
    '../store/authStore': { useAuthStore: select => select({ token: 'synthetic' }) },
    '../api/save': { postSave: (...args) => { const d = deferred(); requests.push({ ...d, args }); return d.promise; } },
    '../api/load': { postLoad: () => { const d = deferred(); loads.push(d); return d.promise; } },
    '../api/snapshots': { postAddSnapshot: () => { const d = deferred(); snapshots.push(d); return d.promise; } },
  };
  const load = sourceLoader(mocks);
  const store = load('lib/store/scheduleStore.ts').useScheduleStore;
  const useStore = select => select(store.getState());
  Object.assign(useStore, { getState: store.getState, setState: store.setState });
  mocks['../store/scheduleStore'] = { useScheduleStore: useStore };
  store.getState().newSchedule('A');
  store.getState().setRemoteBaseline(10, '');
  store.getState().updateMeta({ town: 'Before' });
  const actions = load('lib/hooks/useSaveActions.ts').useSaveActions('A');
  const snapshotActions = load('lib/hooks/useSnapshotActions.ts').useSnapshotActions();
  return { store, actions, snapshotActions, requests, loads, snapshots, routes, unmount: () => cleanups.forEach(f => f?.()) };
}
for (const method of ['save', 'saveForce']) {
  test(`${method}: acknowledges the submitted revision and reads the new baseline on the next save`, async () => {
    const h = setup();
    const saving = h.actions[method]();
    assert.equal(h.requests[0].args[3].expectedSavedAt, 10);
    assert.equal(h.requests[0].args[3].force, method === 'saveForce');
    h.store.getState().updateMeta({ town: 'Newer' });
    h.requests[0].resolve({ savedAt: 20 }); await saving;
    assert.equal(h.requests[0].args[1].meta.town, 'Before');
    assert.equal(h.store.getState().meta.town, 'Newer');
    assert.equal(h.store.getState().dirty, true);
    assert.equal(h.store.getState().syncStatus, 'pending');
    const again = h.actions.save();
    assert.equal(h.requests[1].args[3].expectedSavedAt, 20);
    h.requests[1].resolve({ savedAt: 30 }); await again;
    assert.equal(h.store.getState().dirty, false);
    assert.equal(h.store.getState().syncStatus, 'synced');
  });
}
for (const response of ['success', 'offline', 'conflict']) {
  test(`late ${response} cannot mutate a reopened document with the same name`, async () => {
    const h = setup(); const saving = h.actions.save();
    h.store.getState().newSchedule('A');
    h.store.getState().updateMeta({ town: 'Reopened' });
    const before = h.store.getState();
    if (response === 'success') h.requests[0].resolve({ savedAt: 20 });
    else h.requests[0].reject(Object.assign(new Error('synthetic'), { conflict: response === 'conflict' }));
    await saving;
    assert.equal(h.store.getState(), before);
  });
}
test('unmount cancels acknowledgements without requiring a different schedule name', async () => {
  const h = setup(); const saving = h.actions.save(); h.unmount();
  const before = h.store.getState(); h.requests[0].resolve({ savedAt: 20 }); await saving;
  assert.equal(h.store.getState(), before);
});
test('out-of-order responses do not roll back the latest acknowledged baseline', async () => {
  const h = setup(); const first = h.actions.save();
  h.store.getState().updateMeta({ town: 'Second' }); const second = h.actions.save();
  h.requests[1].resolve({ savedAt: 30 }); await second;
  h.requests[0].resolve({ savedAt: 20 }); await first;
  assert.equal(h.store.getState().remoteBaseline.savedAt, 30);
  assert.equal(h.store.getState().dirty, false);
});
test('Save As retains edits made during its request and keeps them dirty', async () => {
  const h = setup(); const saving = h.actions.saveAs('B');
  h.store.getState().updateMeta({ town: 'Newer' });
  h.requests[0].resolve({ savedAt: 20 }); await saving;
  assert.equal(h.store.getState().scheduleName, 'B');
  assert.equal(h.store.getState().meta.town, 'Newer');
  assert.equal(h.store.getState().dirty, true);
  assert.deepEqual(h.routes, ['/schedule/B']);
});
test('Save As response after navigation cannot replace the document or route', async () => {
  const h = setup(); const saving = h.actions.saveAs('B'); h.store.getState().newSchedule('C');
  const before = h.store.getState(); h.requests[0].resolve({ savedAt: 20 }); await saving;
  assert.equal(h.store.getState(), before); assert.deepEqual(h.routes, []);
});
for (const method of ['resolveConflictOverwrite', 'resolveConflictReload']) {
  test(`${method} stops after its snapshot if navigation changed the document`, async () => {
    const h = setup(); const data = h.store.getState().getScheduleData();
    const pending = h.actions[method]({ local: data, remote: data, scheduleName: 'A' });
    h.store.getState().newSchedule('C'); const before = h.store.getState();
    h.snapshots[0].resolve(); await pending;
    assert.equal(h.store.getState(), before); assert.equal(h.requests.length, 0);
  });
}
test('late cloud loads cannot overwrite a subsequent document', async () => {
  const h = setup(); const loading = h.actions.loadScheduleFromCloud('B');
  h.store.getState().newSchedule('C'); const before = h.store.getState();
  h.loads[0].resolve({ ...before.getScheduleData(), savedAt: 20 }); await loading;
  assert.equal(h.store.getState(), before);
});
test('row edits, undo and redo advance revisions without persisting request guards', () => {
  const h = setup(); const state = () => h.store.getState();
  for (const change of [() => { state().pushUndo(); state().updateRow(0, { action: 'Edit' }); }, () => state().undo(), () => state().redo()]) {
    const revision = state().editRevision; change(); assert.ok(state().editRevision > revision);
  }
  assert.equal('editRevision' in state().getScheduleData(), false);
  assert.equal('documentSession' in state().getScheduleData(), false);
});

test('Save As requires creation and reports an existing name without losing edits', async () => {
  const h = setup(); const saving = h.actions.saveAs('Existing');
  assert.equal(h.requests[0].args[3].createOnly, true);
  h.requests[0].reject(Object.assign(new Error('Choose a different name'), { nameExists: true }));
  await assert.rejects(saving, /different name/);
  assert.equal(h.store.getState().scheduleName, 'A');
  assert.equal(h.store.getState().meta.town, 'Before');
  assert.equal(h.store.getState().dirty, true);
  assert.equal(h.store.getState().remoteBaseline.savedAt, 10);
  assert.equal(h.store.getState().syncStatus, 'pending');
  assert.deepEqual(h.routes, []);
});
function snapshot(h) {
  const data = h.store.getState().getScheduleData();
  return { id: 'test', savedAt: 1, data: { ...data, meta: { ...data.meta, town: 'Snapshot' } } };
}
for (const copy of [false, true]) {
  function start(h) { return copy ? h.snapshotActions.saveAsNew(snapshot(h), 'B') : h.snapshotActions.restore(snapshot(h)); }
  test(`${copy ? 'snapshot copy' : 'restore'} applies only when the submitted document is unchanged`, async () => {
    const h = setup(); const pending = start(h);
    assert.equal(h.requests[0].args[3][copy ? 'createOnly' : 'force'], true);
    h.requests[0].resolve({ savedAt: 20 }); await pending;
    assert.equal(h.store.getState().meta.town, 'Snapshot');
    assert.equal(h.store.getState().scheduleName, copy ? 'B' : 'A');
    assert.equal(h.store.getState().remoteBaseline.savedAt, 20);
    assert.equal(h.store.getState().dirty, false);
  });
  test(`${copy ? 'snapshot copy' : 'restore'} preserves edits made during the request`, async () => {
    const h = setup(); const pending = start(h);
    h.store.getState().updateMeta({ town: 'Newer edits' });
    h.requests[0].resolve({ savedAt: 20 }); const message = await pending;
    assert.match(message, /newer edits/i);
    assert.equal(h.store.getState().meta.town, 'Newer edits');
    assert.equal(h.store.getState().dirty, true);
    assert.equal(h.store.getState().scheduleName, 'A');
    assert.equal(h.store.getState().remoteBaseline.savedAt, copy ? 10 : 20);
    assert.deepEqual(h.routes, []);
  });
  for (const change of ['switch', 'reopen', 'unmount', 'later save']) {
    test(`${copy ? 'snapshot copy' : 'restore'} ignores a late response after ${change}`, async () => {
      const h = setup(); const pending = start(h);
      if (change === 'switch') h.store.getState().newSchedule('C');
      if (change === 'reopen') h.store.getState().newSchedule('A');
      if (change === 'unmount') h.unmount();
      if (change === 'later save') {
        const save = h.actions.save(); h.requests[1].resolve({ savedAt: 30 }); await save;
      }
      const before = h.store.getState();
      h.requests[0].resolve({ savedAt: 20 }); assert.equal(await pending, null);
      assert.equal(h.store.getState(), before);
      assert.deepEqual(h.routes, []);
    });
  }
}
test('an older toolbar save cannot acknowledge edits after restore starts', async () => {
  const h = setup(); const saving = h.actions.save();
  const restoring = h.snapshotActions.restore(snapshot(h));
  const before = h.store.getState();
  h.requests[0].resolve({ savedAt: 20 }); await saving;
  assert.equal(h.store.getState(), before);
  h.requests[1].resolve({ savedAt: 30 }); await restoring;
  assert.equal(h.store.getState().meta.town, 'Snapshot');
  assert.equal(h.store.getState().remoteBaseline.savedAt, 30);
});
test('snapshot copy name collision leaves the source unchanged and can be retried', async () => {
  const h = setup(); const before = h.store.getState();
  const copying = h.snapshotActions.saveAsNew(snapshot(h), 'Existing');
  h.requests[0].reject(Object.assign(new Error('Choose another name'), { nameExists: true }));
  await assert.rejects(copying, /another name/);
  assert.equal(h.store.getState(), before);
  const retry = h.snapshotActions.saveAsNew(snapshot(h), 'Unused');
  h.requests[1].resolve({ savedAt: 20 }); await retry;
  assert.equal(h.store.getState().scheduleName, 'Unused');
});
