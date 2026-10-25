const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function componentHarness(relativeFile, props, dependencies) {
  const slots = [], effects = [];
  let index = 0, queued = [], tree, disposed = false, lateWrites = 0;
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => {
        if (disposed) lateWrites++;
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      }];
    },
    useRef(value) { const i = index++; return slots[i] ?? (slots[i] = {current: value}); },
    useEffect(fn, deps) {
      const i = index++, old = effects[i];
      if (!old || deps.some((value, n) => value !== old.deps[n])) {
        old?.cleanup?.(); effects[i] = {deps};
        queued.push(() => { effects[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({type, props, key});
  const mocks = {react, 'react/jsx-runtime': {jsx, jsxs: jsx}, ...dependencies};
  const source = fs.readFileSync(path.resolve(__dirname, relativeFile), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  let uuid = 0;
  const mod = {exports: {}};
  vm.runInNewContext('(function(require,module,exports){' + js + '\n})', {
    Error, console, structuredClone, localStorage: {getItem: () => null},
    crypto: {randomUUID: () => `id-${++uuid}`},
  })(name => mocks[name] ?? {default: {}}, mod, mod.exports);
  function render() {
    index = 0; tree = mod.exports.default(props);
    const run = queued; queued = []; run.forEach(fn => fn());
  }
  function entries(node = tree, result = [], disabled = false) {
    if (Array.isArray(node)) node.forEach(n => entries(n ?? null, result, disabled));
    else if (node && typeof node === 'object' && !node.props?.hidden && !(node.type === 'modal' && !node.props.open)) {
      const blocked = disabled || (node.type === 'fieldset' && node.props.disabled);
      result.push({node, disabled: blocked || !!node.props?.disabled});
      entries(node.props?.children ?? null, result, blocked);
      entries(node.props?.footer ?? null, result, blocked);
    }
    return result;
  }
  function text(node = tree) {
    if (node == null || typeof node === 'boolean' || node?.props?.hidden) return '';
    if (Array.isArray(node)) return node.map(n => text(n ?? null)).join('');
    return typeof node === 'object' ? text(node.props?.children ?? null) : String(node);
  }
  function button(name) { return entries().find(e => e.node.type === 'button' && text(e.node) === name); }
  function click(name) {
    const entry = button(name); assert.ok(entry, 'button ' + name); assert.ok(!entry.disabled, 'enabled ' + name);
    entry.node.props.onClick(); render();
  }
  function field(label) {
    const entry = entries().find(e => e.node.type === 'label' && text(e.node).startsWith(label));
    assert.ok(entry, 'label ' + label);
    return entries(entry.node).find(e => ['select', 'input'].includes(e.node.type))?.node;
  }
  function change(label, value) {
    const node = field(label); assert.ok(node, 'field ' + label);
    node.props.onChange({target: {value, checked: value}}); render();
  }
  function loadFile(file) {
    const node = entries().find(e => e.node.type === 'input' && e.node.props.type === 'file')?.node;
    assert.ok(node, 'file input');
    const result = node.props.onChange({target: {files: [file], value: file.name}});
    render(); return result;
  }
  async function flush() { await new Promise(resolve => setImmediate(resolve)); render(); }
  function dispose() { disposed = true; effects.forEach(effect => effect?.cleanup?.()); }
  return {props, render, entries, text, click, change, button, field, loadFile, flush, dispose,
    get lateWrites() { return lateWrites; }};
}

const sourceRows = label => [{action: 'Other', otherText: label, desc: `${label} coverage`, dur: '00:30', timeIn: '', sunLocked: false}];
const sourceFile = (name, entries) => ({name, size: 200, text: async () => JSON.stringify(entries)});
const item = label => ({rows: sourceRows(label), savedAt: 123});
const production = {id: 'production-a', name: 'Template library', can_manage: true};

function importHarness() {
  const prepared = [];
  const props = {actor: 'actor-a', organization: 'org-a', productions: [production], disabled: false,
    onPrepare: value => prepared.push(value)};
  const h = componentHarness('../../components/local/LocalBrowserTemplates.tsx', props, {
    './TemplateRowsPreview': {default: 'rows-preview'},
    './template-library.module.css': {default: {createForm: 'create-form', draftChoice: 'draft-choice'}},
    '@/lib/constants': {LS_TEMPLATES_KEY: 'templates'},
    '@/lib/platform/browser-templates': {parseBrowserTemplates: raw => Object.entries(JSON.parse(raw)).map(([name, value]) => ({name, ...value}))},
    '@/lib/platform/schedule-templates': {captureTemplateAttempt: structuredClone,
      templateDraftRows: rows => structuredClone(rows.filter(row => !row.sunLocked))},
  });
  h.render();
  return {...h, prepared, get lateWrites() { return h.lateWrites; },
    async chooseFirst() {
      await h.loadFile(sourceFile('templates.json', {First: item('First'), Second: item('Second')})); h.render();
      h.change('Template to import', '0'); h.change('Destination production', 'production-a');
      h.change('I have permission', true);
    }};
}

test('file selection prepares nothing until a template, destination and permission are reviewed', async () => {
  const h = importHarness();
  await h.loadFile(sourceFile('templates.json', {First: item('First')})); h.render();
  assert.equal(h.prepared.length, 0);
  h.change('Template to import', '0');
  assert.ok(h.button('Review import').disabled);
  h.change('Destination production', 'production-a');
  assert.ok(h.button('Review import').disabled);
  h.change('I have permission', true); h.click('Review import');
  assert.equal(h.prepared.length, 1);
  const attempt = h.prepared[0];
  assert.equal(attempt.operation, 'import'); assert.equal(attempt.version, 0);
  assert.equal(attempt.actor, 'actor-a'); assert.equal(attempt.organization, 'org-a');
  assert.equal(attempt.production, 'production-a'); assert.equal(attempt.ownershipConfirmed, true);
  assert.equal(attempt.browserSource.name, 'First');
  assert.deepEqual(attempt.browserSource.rows, sourceRows('First'));
});

test('choosing another template preserves the file but requires a fresh ownership confirmation', async () => {
  const h = importHarness(); await h.chooseFirst(); h.click('Review import');
  h.change('Template to import', '1');
  assert.equal(h.field('Destination production').props.value, 'production-a');
  assert.equal(h.field('Template name').props.value, 'Second');
  assert.ok(h.button('Review import').disabled);
  h.change('I have permission', true); h.click('Review import');
  assert.equal(h.prepared.length, 2);
  assert.equal(h.prepared[1].browserSource.name, 'Second');
  assert.notEqual(h.prepared[0].request, h.prepared[1].request);
  assert.notEqual(h.prepared[0].id, h.prepared[1].id);
  assert.equal(h.prepared[0].browserSource.name, 'First');
});

test('replacing the file clears the old reviewed selection before asynchronous reading finishes', async () => {
  const h = importHarness(); await h.chooseFirst();
  let resolve;
  const pending = h.loadFile({name: 'new.json', size: 200, text: () => new Promise(r => { resolve = r; })});
  assert.equal(h.button('Review import'), undefined);
  assert.match(h.text(), /Reading template file/);
  resolve(JSON.stringify({New: item('New')})); await pending; h.render();
  assert.equal(h.field('Template to import').props.value, '');
  h.change('Template to import', '0');
  assert.equal(h.field('Destination production').props.value, '');
  assert.ok(h.button('Review import').disabled);
  assert.equal(h.prepared.length, 0);
});

test('a late result from an older file does not replace the newer source', async () => {
  const h = importHarness(); let resolve;
  const old = h.loadFile({name: 'old.json', size: 200, text: () => new Promise(r => { resolve = r; })});
  await h.loadFile(sourceFile('new.json', {New: item('New')})); h.render();
  resolve(JSON.stringify({Old: item('Old')})); await old; h.render();
  h.change('Template to import', '0');
  assert.equal(h.field('Template name').props.value, 'New');
  assert.match(h.text(), /Source: new\.json/);
  assert.doesNotMatch(h.text(), /Source: old\.json/);
});

test('a late file-read failure cannot overwrite the newer successful source status', async () => {
  const h = importHarness(); let reject;
  const old = h.loadFile({name: 'old.json', size: 200, text: () => new Promise((_r, j) => { reject = j; })});
  await h.loadFile(sourceFile('new.json', {New: item('New')})); h.render();
  reject(new Error('Old file is no longer readable')); await old; h.render();
  assert.match(h.text(), /1 template found/);
  assert.doesNotMatch(h.text(), /File could not be read/);
  h.change('Template to import', '0');
  assert.equal(h.field('Template name').props.value, 'New');
});

test('oversized and invalid replacements cannot leave the prior import enabled', async () => {
  const h = importHarness(); await h.chooseFirst();
  await h.loadFile({name: 'large.json', size: 20_000_001, text: async () => { throw Error('must not read'); }}); h.render();
  assert.match(h.text(), /exceeds 20 MB/); assert.equal(h.button('Review import'), undefined);
  await h.loadFile({name: 'invalid.json', size: 30, text: async () => '{ invalid'}); h.render();
  assert.equal(h.button('Review import'), undefined); assert.equal(h.prepared.length, 0);
});

test('loss of production-management access disables the retained import review', async () => {
  const h = importHarness(); await h.chooseFirst();
  h.props.productions = [{...production, can_manage: false}]; h.render();
  assert.ok(h.button('Review import').disabled);
  assert.equal(h.prepared.length, 0);
});

test('unmounting invalidates pending file reads without late state writes', async () => {
  for (const failure of [false, true]) {
    const h = importHarness(); let complete;
    const pending = h.loadFile({name: 'pending.json', size: 200, text: () => new Promise((resolve, reject) => { complete = failure ? reject : resolve; })});
    h.dispose(); complete(failure ? Error('unmounted') : JSON.stringify({First: item('First')}));
    await pending; assert.equal(h.lateWrites, 0);
  }
});

function parentHarness() {
  const sent = [], retained = [], draft = {templateUses: []};
  const props = {actor: 'actor-a', organization: 'org-a', enabled: true, embedded: false,
    canWriteCurrent: false, getSource: () => null, canApply: () => false,
    onApply() {}, onState() {}, requireAuth() {}, client: {}};
  const repo = {productions: async () => [production], inventory: async () => [], send: async a => sent.push(a)};
  const useStore = fn => fn(draft); useStore.getState = () => draft;
  const h = componentHarness('../../components/local/LocalScheduleTemplates.tsx', props, {
    './LocalBrowserTemplates': {default: 'browser-import'},
    '@/components/modals/Modal': {default: 'modal', ModalVisibilityContext: {Provider: 'provider'}},
    '@/lib/store/scheduleStore': {useScheduleStore: useStore},
    '@/lib/platform/schedule-repository': {ScheduleRepositoryError: class extends Error {}},
    '@/lib/platform/schedule-templates': {createTemplateRepository: () => repo, readTemplateRequest: () => null,
      clearTemplateRequest() {}, retainTemplateRequest: (_storage, value) => retained.push(value),
      captureTemplateAttempt: structuredClone, templateDraftRows: structuredClone},
    '@/lib/platform/schedule-library': {createScheduleLibraryRepository: () => ({})},
    '@/lib/platform/schedule-lifecycle-repository': {createLifecycleRepository: () => ({})},
  });
  return {...h, sent, retained, child: () => h.entries().find(e => e.node.type === 'browser-import')?.node,
    async openImport() { h.render(); h.render(); h.click('Templates'); await h.flush(); h.click('Import templates'); }};
}

test('Templates exposes native import without an open source schedule and waits for final confirmation', async () => {
  const h = parentHarness(); await h.openImport();
  const child = h.child(); assert.ok(child, 'Import templates surface is reachable');
  assert.equal(child.props.actor, 'actor-a'); assert.equal(child.props.organization, 'org-a');
  assert.equal(child.props.disabled, false);
  const attempt = {operation: 'import', actor: 'actor-a', organization: 'org-a', production: 'production-a',
    id: 'template-a', request: 'request-a', version: 0, name: 'First', previewName: 'First', previewRows: sourceRows('First'),
    rows: null, source: null, sourceVersion: null, ownershipConfirmed: true, browserSource: {name: 'First', ...item('First')}};
  child.props.onPrepare(attempt); h.render();
  assert.equal(h.sent.length, 0); assert.equal(h.retained.length, 1);
  assert.match(h.text(), /Template library/);
  h.click('Cancel'); assert.equal(h.sent.length, 0);
  assert.ok(h.child(), 'Cancel returns to the retained import surface');
});

test('switching actor or organization remounts the import source under a new scope key', async () => {
  const h = parentHarness(); await h.openImport(); let before = h.child().key;
  for (const [actor, organization] of [['actor-b', 'org-a'], ['actor-b', 'org-b']]) {
    h.props.actor = actor; h.props.organization = organization; h.render(); h.render();
    h.click('Templates'); await h.flush(); h.click('Import templates');
    const after = h.child(); assert.ok(after);
    assert.notEqual(after.key, before);
    assert.equal(after.props.actor, actor); assert.equal(after.props.organization, organization);
    assert.equal(h.sent.length, 0); before = after.key;
  }
});

test('final confirmation sends one native import and disables another send while it is in flight', async () => {
  const h = parentHarness(); await h.openImport();
  const attempt = {operation: 'import', actor: 'actor-a', organization: 'org-a', production: 'production-a',
    id: 'template-a', request: 'request-a', version: 0, name: 'First', previewName: 'First', previewRows: sourceRows('First'),
    rows: null, source: null, sourceVersion: null, ownershipConfirmed: true, browserSource: {name: 'First', ...item('First')}};
  h.child().props.onPrepare(attempt); h.render(); h.click('Confirm change');
  assert.ok(h.button('Retry change').disabled);
  await h.flush(); assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].operation, 'import'); assert.equal(h.sent[0].request, 'request-a');
  assert.equal(h.sent[0].source, null); assert.deepEqual(h.sent[0].browserSource.rows, sourceRows('First'));
  assert.match(h.text(), /Template imported/);
});
