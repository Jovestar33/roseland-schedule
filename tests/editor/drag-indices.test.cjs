const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function grid(rows) {
  const state = { rows, rowKeys: rows.map((_, i) => `row-${i}`), reorderRows() {}, pushUndo() {} };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    './LocalEditorContext': {useLocalEditor:()=>true},
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@hello-pangea/dnd': { DragDropContext: 'Context', Droppable: 'Droppable', Draggable: 'Draggable' },
    '@/lib/store/scheduleStore': { useScheduleStore: select => select(state) },
    '@/lib/store/cmsStore': { useCmsLabel: (_, fallback) => fallback },
    '@/components/ui/ToastProvider': { useToast: () => ({ addToast() {} }) },
    '@/lib/time': { durm: () => 0 },
    './ScheduleRow': { default: 'ScheduleRow' },
    './SunriseSunsetRow': { default: 'SunRow' },
  };
  const source = ts.transpileModule(fs.readFileSync('components/schedule/ScheduleGrid.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(source, { exports: mod.exports, require: name => {
    if (!(name in mocks)) throw new Error(name);
    return mocks[name];
  }});
  return mod.exports.default({});
}
function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, type); if (found) return found;
  }
}
test('drag indices stay contiguous across repeated Droppable renders with sun rows', () => {
  const rows = [{sunLocked:true}, {}, {}, {sunLocked:true}, {}, {}];
  const tree = grid(rows);
  const render = find(tree, 'Droppable').props.children;
  for (let iteration = 0; iteration < 5; iteration++) {
    const body = render({ innerRef() {}, droppableProps: {}, placeholder: null });
    const items = body.props.children.flat(Infinity).filter(x => x?.type === 'Draggable');
    assert.deepEqual(Array.from(items, x => x.props.index), [0,1,2,3]);
    assert.deepEqual(Array.from(items, x => x.props.draggableId), ['row-1','row-2','row-4','row-5']);
  }
});
