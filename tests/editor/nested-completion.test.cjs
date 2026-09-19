const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { sourceLoader } = require('./source-loader.cjs');

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object') return [];
  return [node, ...descendants(node.props?.children)];
}

test('nested completion Undo preserves an earlier row edit, and Redo restores completion', () => {
  const load = sourceLoader();
  const store = load('lib/store/scheduleStore.ts').useScheduleStore;
  const fixture = load('tests/fixtures/document-fixtures.ts').documentFixture(1);
  store.getState().loadSchedule('Nested completion fixture', fixture);
  store.getState().pushUndo();
  store.getState().updateRow(0, { desc: 'Earlier edit must survive' });
  const code = ts.transpileModule(fs.readFileSync('components/schedule/LocationCell.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mocks = {
    react: { ...React, useState: value => [value, () => {}], useRef: value => ({ current: value }), useLayoutEffect: () => {} },
    '@/lib/store/scheduleStore': { useScheduleStore: select => select(store.getState()) },
    '@/components/local/DocumentProvidersContext': { useDocumentProviders: () => null },
    './LocalEditorContext': { useLocalEditor: () => ({}) },
    './PlacesAutocomplete': { default: () => null },
    '@/lib/observe-textarea-size': { observeTextareaSize: () => () => {} },
  };
  const mod = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})')(name => mocks[name] ?? require(name), mod, mod.exports);
  const tree = mod.exports.default({ index: 0, row: store.getState().rows[0] });
  const checkbox = descendants(tree).find(node => node.type === 'input' && node.props.type === 'checkbox');
  checkbox.props.onChange({ target: { checked: true } });
  assert.equal(store.getState().rows[0].subLocations[0].done, true);
  store.getState().undo();
  assert.equal(store.getState().rows[0].subLocations[0].done, false);
  assert.equal(store.getState().rows[0].desc, 'Earlier edit must survive');
  store.getState().redo();
  assert.equal(store.getState().rows[0].subLocations[0].done, true);
  assert.equal(store.getState().rows[0].desc, 'Earlier edit must survive');
});
