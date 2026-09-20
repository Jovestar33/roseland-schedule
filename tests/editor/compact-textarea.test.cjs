const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceLoader } = require('./source-loader.cjs');

test('compact textarea preserves all text, detects overflow and follows width/font changes', async () => {
  let resize, fontResize, disconnected = false;
  const oldObserver = global.ResizeObserver, oldStyle = global.getComputedStyle;
  global.ResizeObserver = class { constructor(cb) { resize = cb; } observe() {} disconnect() { disconnected = true; } };
  global.getComputedStyle = () => ({ paddingTop: '5px', paddingBottom: '5px', borderTopWidth: '1px', borderBottomWidth: '1px', lineHeight: '20px', fontSize: '14px', boxSizing: 'border-box' });
  try {
    const el = { clientWidth: 0, scrollHeight: 210, scrollTop: 80, value: 'Complete saved note', style: { height: '40px' }, ownerDocument: { fonts: { ready: Promise.resolve(), addEventListener(n, fn) { fontResize = fn; }, removeEventListener() { fontResize = null; } } } };
    const flags = [];
    const { observeTextareaSize } = sourceLoader()('lib/observe-textarea-size.ts');
    const stop = observeTextareaSize(el, { rows: 3, expanded: false, onOverflow: flag => flags.push(flag) });
    assert.equal(el.style.height, '40px', 'wait until a hidden field becomes visible');
    el.clientWidth = 200; resize();
    assert.equal(el.style.height, '72px'); assert.equal(flags.at(-1), true); assert.equal(el.scrollTop, 0);
    assert.equal(el.value, 'Complete saved note');
    el.clientWidth = 500; el.scrollHeight = 50; resize();
    assert.equal(el.style.height, '52px'); assert.equal(flags.at(-1), false, 'short notes need no expander');
    el.scrollHeight = 110; fontResize(); assert.equal(flags.at(-1), true); assert.equal(el.style.height, '72px');
    stop(); assert.equal(disconnected, true); assert.equal(fontResize, null);
    el.scrollHeight = 500; await Promise.resolve(); assert.equal(el.style.height, '72px');
    const stopExpanded = observeTextareaSize(el, { rows: 3, expanded: true, onOverflow: flag => flags.push(flag) });
    assert.equal(el.style.height, '502px'); assert.equal(flags.at(-1), true, 'Less remains available when expanded');
    stopExpanded();
    global.getComputedStyle = () => ({ paddingTop: '5px', paddingBottom: '5px', borderTopWidth: '0px', borderBottomWidth: '0px', lineHeight: '20px', fontSize: '14px', boxSizing: 'content-box' });
    const stopContent = observeTextareaSize(el, { rows: 3, expanded: false, onOverflow: () => {} });
    assert.equal(el.style.height, '60px'); stopContent();
  } finally { global.ResizeObserver = oldObserver; global.getComputedStyle = oldStyle; }
});
