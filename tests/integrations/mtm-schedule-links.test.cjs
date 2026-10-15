const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROJECT_ID, normalizeTown, planUpdates, runSync } = require('../../netlify/lib/mtm-schedule-links.cjs');
const targets = [{ town: 'Fuquay-Varina', id: '1', name: 'Fuquay-Varina Overview', tasklistId: '2' }];
const task = () => ({ id: '1', name: targets[0].name, project: { id: PROJECT_ID }, tasklist: { id: '2' } });
const schedule = (name, savedAt, projectName = 'Main To Main Trail') => ({ name, data: { savedAt, meta: { town: 'Fuquay-Varina, NC', projectName } } });
const names = ['Main To Main Trail'];

test('latest saved schedule wins and URL is encoded', () => {
  const updates = planUpdates([schedule('Old', 1), schedule('Latest – draft', 2)], [task()], targets, names);
  assert.equal(updates[0].url, 'https://roselandschedule.netlify.app/?s=Latest%20%E2%80%93%20draft');
});
test('different production and different town never match', () => {
  assert.deepEqual(planUpdates([schedule('Other', 9, 'Other Film')], [task()], targets, names), []);
  const other = schedule('Elsewhere', 9); other.data.meta.town = 'Another town';
  assert.deepEqual(planUpdates([other], [task()], targets, names), []);
});
test('legacy blank production is matched only by exact normalized town', () => {
  assert.equal(planUpdates([schedule('Legacy', 3, '')], [task()], targets, names).length, 1);
  assert.equal(normalizeTown('City of Fuquay–Varina, NC, USA'), 'fuquay varina');
});
test('existing correct link is idempotent; absent schedule never clears it', () => {
  const t = { ...task(), production_schedule: 'https://roselandschedule.netlify.app/?s=Current' };
  assert.deepEqual(planUpdates([schedule('Current', 5)], [t], targets, names), []);
  assert.deepEqual(planUpdates([], [t], targets, names), []);
});
test('renamed/moved/outside project destination aborts before any writes', async () => {
  for (const changed of [{ name: 'Film Shoot' }, { project: { id: 'other' } }, { tasklist: { id: 'other' } }]) {
    let writes = 0;
    await assert.rejects(runSync({ readSchedules: async () => [schedule('Latest', 2)], listTasks: async () => [{ ...task(), ...changed }], patchTask: async () => writes++, targets, productionNames: names, dryRun: false }));
    assert.equal(writes, 0);
  }
});
test('partial source read failure never writes an older link', async () => {
  let writes = 0;
  await assert.rejects(runSync({ readSchedules: async () => { throw Error('read failure'); }, listTasks: async () => [task()], patchTask: async () => writes++, targets, productionNames: names, dryRun: false }));
  assert.equal(writes, 0);
});
test('dry run does not write; writes contain only the production schedule field', async () => {
  const writes = [];
  const opts = { readSchedules: async () => [schedule('New', 2)], listTasks: async () => [task()], patchTask: async (...args) => writes.push(args), targets, productionNames: names };
  assert.equal((await runSync(opts)).pending, 1); assert.equal(writes.length, 0);
  assert.equal((await runSync({ ...opts, dryRun: false })).updated, 1);
  assert.deepEqual(writes, [['1', { production_schedule: 'https://roselandschedule.netlify.app/?s=New' }]]);
});
test('deadline leaves work pending for next run', async () => {
  const result = await runSync({ readSchedules: async () => [schedule('New', 2)], listTasks: async () => [task()], patchTask: async () => assert.fail(), targets, productionNames: names, dryRun: false, deadline: 3000, now: () => 0 });
  assert.equal(result.pending, 1); assert.equal(result.updated, 0);
});
test('long links and missing target records stop rather than corrupt a URL or silently skip a task', () => {
  assert.throws(() => planUpdates([schedule('x'.repeat(250), 1)], [task()], targets, names), /field_limit/);
  assert.throws(() => planUpdates([], [], targets, names), /missing/);
});
test('live destination mapping contains 74 Overview records for exactly 72 towns', () => {
  const mapping = require('../../netlify/lib/mtm-overview-targets.json');
  assert.equal(mapping.length, 74); assert.equal(new Set(mapping.map(t => t.town)).size, 72);
  assert.equal(new Set(mapping.map(t => t.id)).size, 74);
  assert.ok(mapping.every(t => t.name.endsWith(' Overview') || t.name === 'Garner'));
});

test('runtime deploy context blocks previews and unpublished deploys even with enabled environment flag', async () => {
  const handler = (await import('../../netlify/functions/mtm-schedule-links.mjs')).default;
  const old = process.env.MTM_LINK_SYNC_ENABLED;
  process.env.MTM_LINK_SYNC_ENABLED = 'true';
  try {
    await handler(undefined, { deploy: { context: 'deploy-preview', published: true } });
    await handler(undefined, { deploy: { context: 'production', published: false } });
    await handler(undefined, undefined);
  } finally {
    if (old === undefined) delete process.env.MTM_LINK_SYNC_ENABLED;
    else process.env.MTM_LINK_SYNC_ENABLED = old;
  }
});
