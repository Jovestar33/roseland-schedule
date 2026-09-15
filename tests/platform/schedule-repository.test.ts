import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduleRepository, ScheduleRepositoryError } from '../../lib/platform/schedule-repository.ts';

const id = '66000000-0000-4000-a000-000000000001';
const record = { id, organization_id: id, production_id: id, production_day_id: id, updated_by: id,
  display_name: 'Fictional', updated_at: '2026-09-15T00:00:00Z',
  document_version: 2, document_schema_version: 1, document: { meta: {}, rows: [] } };
const failure = (kind: string) => (error: unknown) => error instanceof ScheduleRepositoryError && error.kind === kind;

test('update carries the original expected version and complete document to the RPC', async () => {
  const document = { meta: { callsheet: { notes: 'Fictional' } }, rows: [{ dur: '00:00', contactName: 'Test' }] };
  const repo = createScheduleRepository({ rpc: async (name, args) => {
    assert.equal(name, 'update_schedule_document');
    assert.deepEqual(args, { target_schedule_id: id, expected_version: 1, next_document: document, schema_version: 1 });
    return { data: { ...record, document }, error: null };
  } });
  assert.deepEqual((await repo.update(id, 1, document, 1)).document, document);
});

test('read uses the RLS-backed target RPC', async () => {
  const repo = createScheduleRepository({ rpc: async (name, args) => {
    assert.equal(name, 'read_schedule');
    assert.deepEqual(args, { target_schedule_id: id });
    return { data: record, error: null };
  } });
  assert.equal((await repo.read(id)).id, id);
});

test('unsafe versions and IDs never reach the transport', () => {
  const repo = createScheduleRepository({ rpc() { throw new Error('Transport must not run'); } });
  for (const version of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER, undefined]) {
    assert.throws(() => repo.update(id, version as number, {}, 1), failure('invalid'));
  }
  assert.throws(() => repo.read('invalid'), failure('invalid'));
  assert.throws(() => repo.update(id, 1, {}, 2), failure('invalid'));
});

test('database errors become bounded outcomes without exposing server details', async () => {
  for (const [code, kind] of Object.entries({ PT400: 'invalid', PT401: 'unauthenticated', PGRST301: 'unauthenticated', PT404: 'unavailable', PT409: 'conflict', '42501': 'unavailable', XX000: 'failed' })) {
    const repo = createScheduleRepository({ rpc: async () => ({ data: null, error: { code, message: 'Private database detail' } }) });
    await assert.rejects(repo.update(id, 1, {}, 1), (error: unknown) => {
      assert.ok(error instanceof ScheduleRepositoryError);
      assert.equal(error.kind, kind);
      assert.ok(!error.message.includes('Private'));
      return true;
    });
  }
});

test('uncertain transport result cannot acknowledge a save or auto-retry it', async () => {
  let calls = 0;
  const repo = createScheduleRepository({ rpc: async () => { calls++; throw new Error('lost reply'); } });
  await assert.rejects(repo.update(id, 1, {}, 1), failure('failed'));
  assert.equal(calls, 1);
});

test('malformed, mismatched and stale acknowledgements are rejected', async () => {
  for (const data of [null, {}, { ...record, id: 'other' }, { ...record, document_version: 1 }, { ...record, document_version: 3 }, { ...record, document: null }, { ...record, updated_by: undefined }, { ...record, updated_at: 'invalid' }]) {
    const repo = createScheduleRepository({ rpc: async () => ({ data, error: null }) });
    await assert.rejects(repo.update(id, 1, {}, 1), failure('failed'));
  }
});
