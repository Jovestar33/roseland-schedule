const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('./source-loader.cjs');
test('textareas recover full text height after hidden admission, width changes and font loading',async()=>{
  let callback,disconnected=false,fontCallback;
  const old=global.ResizeObserver,oldRaf=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;
  let frame;
  global.requestAnimationFrame=fn=>{frame=fn;return 1;};
  global.cancelAnimationFrame=()=>{frame=null;};
  const flush=()=>{const fn=frame;frame=null;fn?.();};
  global.ResizeObserver=class {constructor(cb){callback=cb;}observe(){}disconnect(){disconnected=true;}};
  try {
    const el={clientWidth:0,scrollHeight:0,style:{height:'40px'},ownerDocument:{fonts:{ready:Promise.resolve(),addEventListener(n,fn){fontCallback=fn;},removeEventListener(){fontCallback=null;}}}};
    const {observeTextareaSize}=sourceLoader()('lib/observe-textarea-size.ts');
    const stop=observeTextareaSize(el);
    assert.equal(el.style.height,'40px','hidden measurement must not collapse existing height');
    el.clientWidth=200;el.scrollHeight=112;callback();assert.equal(el.style.height,'40px');flush();assert.equal(el.style.height,'112px');
    el.clientWidth=100;el.scrollHeight=224;callback();flush();assert.equal(el.style.height,'224px');
    el.scrollHeight=240;fontCallback();assert.equal(el.style.height,'240px');
    stop();assert.equal(disconnected,true);assert.equal(fontCallback,null);
    el.scrollHeight=999;await Promise.resolve();assert.equal(el.style.height,'240px','late font readiness cannot touch unmounted textarea');
  }finally{global.ResizeObserver=old;global.requestAnimationFrame=oldRaf;global.cancelAnimationFrame=oldCancel;}
});
