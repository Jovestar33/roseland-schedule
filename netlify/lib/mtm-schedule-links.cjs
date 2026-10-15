const PORTAL_ID = '811125478';
const PROJECT_ID = '2123834000003942140';
const FIELD = 'production_schedule';
const ORIGIN = 'https://roselandschedule.netlify.app';

function normalizeTown(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase()
    .replace(/^city of\s+/, '').replace(/,\s*(nc|north carolina)(,\s*(usa|united states))?$/, '')
    .replace(/[–—-]/g, ' ').replace(/\s+/g, ' ');
}

// The legacy library contains schedules without a production label. A town must
// still match an explicitly mapped MTM Overview; named other productions never match.
function selectLatest(schedules, targets, productionNames) {
  const allowed = new Set(productionNames.map(normalizeTown));
  const towns = new Set(targets.map(t => normalizeTown(t.town)));
  const latest = new Map();
  for (const { name, data } of schedules) {
    // Geocoded locations include locality/county/state after the town label.
    const town = normalizeTown(String(data?.meta?.town || '').split(',')[0]);
    const production = normalizeTown(data?.meta?.projectName);
    if (!towns.has(town) || (production && !allowed.has(production))) continue;
    const savedAt = Number(data?.savedAt);
    if (!name || !Number.isFinite(savedAt) || savedAt <= 0) continue;
    const candidate = { town, name, savedAt, url: `${ORIGIN}/?s=${encodeURIComponent(name)}` };
    // Zoho's existing URL field has a 200-character limit. Never write a truncated link.
    if (candidate.url.length > 200) throw new Error('schedule_link_exceeds_field_limit');
    const prior = latest.get(town);
    if (!prior || savedAt > prior.savedAt || (savedAt === prior.savedAt && name.localeCompare(prior.name) > 0)) latest.set(town, candidate);
  }
  return latest;
}

function planUpdates(schedules, tasks, targets, productionNames) {
  const latest = selectLatest(schedules, targets, productionNames);
  const byId = new Map(tasks.map(t => [String(t.id), t]));
  const changes = [];
  for (const target of targets) {
    const task = byId.get(target.id);
    if (!task) throw new Error('mapped_overview_missing');
    if (String(task.project?.id) !== PROJECT_ID || task.name !== target.name || String(task.tasklist?.id) !== target.tasklistId) {
      throw new Error('mapped_overview_changed');
    }
    const schedule = latest.get(normalizeTown(target.town));
    if (schedule && task[FIELD] !== schedule.url) {
      changes.push({ taskId: target.id, town: target.town, scheduleName: schedule.name, url: schedule.url });
    }
  }
  return changes;
}

async function mapLimit(items, limit, mapper) {
  let index = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      result[i] = await mapper(items[i]);
    }
  }));
  return result;
}

async function runSync({ readSchedules, listTasks, patchTask, targets, productionNames, dryRun = true, deadline = Infinity, now = Date.now }) {
  // Finish every read and validate every destination before any update. A failed
  // schedule read must not make an older schedule look like the newest one.
  const schedules = await readSchedules();
  const tasks = await listTasks();
  const changes = planUpdates(schedules, tasks, targets, productionNames);
  const matchedTowns = selectLatest(schedules, targets, productionNames).size;
  const result = { dryRun, matchedTasks: targets.length, matchedTowns, pending: changes.length, updated: 0, changes: dryRun ? changes : undefined };
  if (dryRun) return result;
  for (const change of changes) {
    if (now() > deadline - 4000) break;
    await patchTask(change.taskId, { [FIELD]: change.url });
    result.updated++;
    result.pending--;
  }
  return result;
}
module.exports = { PORTAL_ID, PROJECT_ID, FIELD, normalizeTown, selectLatest, planUpdates, mapLimit, runSync };
