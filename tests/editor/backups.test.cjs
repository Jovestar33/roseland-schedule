const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceLoader } = require('./source-loader.cjs');
const sample = { meta: { town: 'Test', callsheet: { notes: 'Preserve me' } }, rows: [{ action: 'Shoot', dur: '0', contactName: 'Synthetic', subLocations: [{ loc: 'Park', done: false }] }], savedAt: 3 };
function setup() {
  const writes = [];
  const mocks = { './load': { listSchedules: async () => ['A', 'B'], postLoad: async () => sample },
    './save': { postSave: async (name, data, token, opts) => { writes.push({ name, data, opts }); if (name === 'Existing') throw new Error('Name exists'); } } };
  return { api: sourceLoader(mocks)('lib/api/backups.ts'), writes, mocks };
}
test('new and legacy backup formats round-trip complete schedule fields', async () => {
  const { api } = setup();
  const exported = await api.exportScheduleBackup('synthetic');
  assert.deepEqual(api.parseScheduleBackup(JSON.stringify(exported), '').map(e => e.data), [sample, sample]);
  assert.deepEqual(api.parseScheduleBackup(JSON.stringify({ A: sample }), '')[0], { name: 'A', data: sample });
  assert.deepEqual(api.parseScheduleBackup(JSON.stringify(sample), 'Single')[0], { name: 'Single', data: sample });
});
test('export fails instead of silently omitting unreadable schedules', async () => {
  const h = setup(); h.mocks['./load'].postLoad = async name => name === 'B' ? null : sample;
  await assert.rejects(h.api.exportScheduleBackup('synthetic'), /Could not read B/);
});
test('invalid backups are rejected before any writes', async () => {
  const h = setup();
  await assert.rejects(h.api.importScheduleBackup([{ name: 'Good', data: sample }, { name: 'Bad', data: { rows: null } }], 'synthetic'));
  assert.equal(h.writes.length, 0);
  assert.throws(() => h.api.parseScheduleBackup(JSON.stringify({ A: { ...sample, rows: [{ action: {} }] } }), ''), /Invalid row/);
  assert.throws(() => h.api.parseScheduleBackup('{"format":"roseland-schedules","version":99,"schedules":[]}', ''), /Unsupported/);
});
test('imports are create-only and report partial failures without overwriting', async () => {
  const h = setup(); const result = await h.api.importScheduleBackup([{ name: 'New', data: sample }, { name: 'Existing', data: sample }], 'synthetic');
  assert.deepEqual(result.imported, ['New']); assert.equal(result.failed[0].name, 'Existing');
  assert.ok(h.writes.every(write => write.opts.createOnly));
});
