let editorToken=sessionStorage.getItem(AUTH_TOKEN_KEY)||'';
const IS_READ_ONLY_LINK=new URLSearchParams(window.location.search).has('v');

function setEditorToken(token){
  editorToken=token||'';
  if(token) sessionStorage.setItem(AUTH_TOKEN_KEY,token);
  else sessionStorage.removeItem(AUTH_TOKEN_KEY);
}
function showLogin(msg=''){
  if(IS_READ_ONLY_LINK) return;
  document.body.classList.add('security-locked');
  const m=document.getElementById('security-msg');
  if(m) m.textContent=msg||'';
  setTimeout(()=>document.getElementById('security-password')?.focus(),80);
}
function hideLogin(){
  document.body.classList.remove('security-locked');
}
async function submitEditorLogin(){
  const inp=document.getElementById('security-password');
  const password=(inp?.value||'').trim();
  if(!password){showLogin('Enter your editor password to open schedules and make changes.');return;}
  const m=document.getElementById('security-msg');
  if(m) m.textContent='';
  try{
    const res=await fetch('/.netlify/functions/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok||!data.token){
      showLogin(data.error||'That password did not work. Please try again.');
      return;
    }
    setEditorToken(data.token);
    if(inp) inp.value='';
    hideLogin();
    window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    await appBootstrap();
    setTimeout(()=>window.scrollTo({top:0,left:0,behavior:'auto'}),30);
  }catch(e){
    showLogin('Login failed. Check connection and deploy settings.');
  }
}
async function ensureEditorAccess(){
  if(IS_READ_ONLY_LINK) return true;
  if(!editorToken){
    showLogin();
    return false;
  }
  return true;
}

function openLinkModal(title,url){
  const titleEl=document.getElementById('link-modal-title');
  const nameEl=document.getElementById('link-modal-name');
  const ta=document.getElementById('link-modal-url');
  if(titleEl) titleEl.textContent=title||'Copy Link';
  if(nameEl) nameEl.textContent=title&&title.includes(' for ')?title.split(' for ').slice(1).join(' for '):'';
  if(ta){
    ta.value=url||'';
    ta.scrollTop=0;
  }
  openOv('ov-linkcopy');
  setTimeout(()=>{
    if(ta){
      ta.focus();
      ta.select();
      ta.setSelectionRange(0,ta.value.length);
    }
  },40);
}
async function copyLinkFromModal(){
  const ta=document.getElementById('link-modal-url');
  if(!ta) return;
  ta.focus();
  ta.select();
  ta.setSelectionRange(0,ta.value.length);
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(ta.value);
      toast('Link copied — ready to share');
      return;
    }
  }catch(e){}
  try{
    document.execCommand('copy');
    toast('Link copied — ready to share');
  }catch(e){
    toast('Full link is ready — copy it from the box if your browser blocks auto-copy');
  }
}
async function copyClientVendorLinkExact(name){
  name=String(name||'').trim();
  if(!name){toast('Missing schedule name');return;}
  try{
    if(!(await ensureEditorAccess())) return;
    const res=await fetch(`/.netlify/functions/view-link?name=${encodeURIComponent(name)}&editorToken=${encodeURIComponent(editorToken)}`);
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.viewToken) throw new Error(data.error||'Could not generate read-only link');

    const url=`${window.location.origin}${window.location.pathname}?v=${encodeURIComponent(name)}&vt=${encodeURIComponent(data.viewToken)}`;
    openLinkModal(`Client / Vendor Link for ${name}`, url);
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
        toast(`Client / Vendor link ready for ${name}`);
      }else{
        toast('Full link is ready — copy and share it');
      }
    }catch(e){
      toast('Full link is ready — copy and share it');
    }
  }catch(e){
    toast(e.message||'Could not generate the link right now');
  }
}

function copyTeamLinkExact(name){
  name=String(name||'').trim();
  if(!name){toast('Missing schedule name');return;}
  const url=`${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(name)}`;
  openLinkModal(`Team Link for ${name}`, url);
  (async()=>{
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
        toast(`Team link ready for ${name}`);
      }else{
        toast('Full link is ready — copy and share it');
      }
    }catch(e){
      toast('Full link is ready — copy and share it');
    }
  })();
}

async function getViewToken(name){
  if(!(await ensureEditorAccess())) throw new Error('Editor login required');
  const res=await fetch(`/.netlify/functions/view-link?name=${encodeURIComponent(name)}&editorToken=${encodeURIComponent(editorToken)}`);
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.viewToken) throw new Error(data.error||'Could not generate read-only link');
  return data.viewToken;
}
async function buildViewUrl(name){
  const vt=await getViewToken(name);
  return `${window.location.origin}${window.location.pathname}?v=${encodeURIComponent(name)}&vt=${encodeURIComponent(vt)}`;
}
async function copyViewLink(name){
  try{
    const url=await buildViewUrl(name);
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
        toast('Client / Vendor link copied — ready to share');
        return;
      }
    }catch(e){}
    prompt('Copy Client / Vendor Link:', url);
  }catch(e){
    toast(e.message||'Could not generate the link right now');
  }
}
document.addEventListener('keydown',e=>{
  if(e.key==='Enter' && document.body.classList.contains('security-locked')) submitEditorLogin();
});

function markDirty(){isDirty=true;}
function makeRow(){
  return{action:'',otherText:'',desc:'',loc:'',locLat:null,locLng:null,notes:'',
    timeIn:'',dur:'',done:false,sunLocked:false,fixedIn:false,fixedOut:false,fixedOutTime:''};
}
function initRows(n=15){rows=Array.from({length:n},makeRow);}

/* ─────────────────────────────────────────────
   UNDO / REDO
   Records committed edits, not every keystroke.
───────────────────────────────────────────── */
let undoStack=[], redoStack=[];
let editStartState=null;
const UNDO_LIMIT=80;

function cloneScheduleState(){
  return {rows:JSON.parse(JSON.stringify(rows)), meta:getMeta(), curName, isDirty};
}
function restoreScheduleState(state){
  if(!state) return;
  rows=(state.rows||[]).map(r=>({...makeRow(),...r}));
  setMeta(state.meta||{});
  curName=state.curName||curName;
  isDirty=true;
  const lbl=document.getElementById('sched-label');
  if(lbl) lbl.textContent=curName||'Unsaved schedule';
  render();
  updateUndoRedoButtons();
}
function statesEqual(a,b){
  try{return JSON.stringify(a?.rows)===JSON.stringify(b?.rows) && JSON.stringify(a?.meta)===JSON.stringify(b?.meta) && a?.curName===b?.curName;}
  catch(e){return false;}
}
function pushUndoState(beforeState){
  if(!beforeState) return;
  const now=cloneScheduleState();
  if(statesEqual(beforeState, now)) return;
  undoStack.push(beforeState);
  if(undoStack.length>UNDO_LIMIT) undoStack.shift();
  redoStack=[];
  updateUndoRedoButtons();
}
function beginUndoCapture(){
  if(!editStartState) editStartState=cloneScheduleState();
}
function commitUndoCapture(){
  if(!editStartState) return;
  pushUndoState(editStartState);
  editStartState=null;
}
function recordUndoStep(){
  pushUndoState(cloneScheduleState());
}
function undoLast(){
  if(!undoStack.length) return;
  const current=cloneScheduleState();
  const prev=undoStack.pop();
  redoStack.push(current);
  restoreScheduleState(prev);
  toast('Undo');
}
function redoLast(){
  if(!redoStack.length) return;
  const current=cloneScheduleState();
  const next=redoStack.pop();
  undoStack.push(current);
  restoreScheduleState(next);
  toast('Redo');
}
function updateUndoRedoButtons(){
  const u=document.getElementById('undo-btn'), r=document.getElementById('redo-btn');
  if(u) u.classList.toggle('undo-disabled', !undoStack.length);
  if(r) r.classList.toggle('undo-disabled', !redoStack.length);
}
function resetUndoHistory(){
  undoStack=[]; redoStack=[]; editStartState=null; updateUndoRedoButtons();
}
document.addEventListener('keydown', e=>{
  const mod=e.metaKey||e.ctrlKey;
  if(!mod) return;
  const key=e.key.toLowerCase();
  if(key==='z'){
    e.preventDefault();
    if(e.shiftKey) redoLast(); else undoLast();
  }else if(key==='y'){
    e.preventDefault();
    redoLast();
  }
});

/* ─────────────────────────────────────────────
   TIME CHAIN
───────────────────────────────────────────── */
function getTimeIn(i){
  const fn=rows.findIndex(r=>!r.sunLocked);
  if(rows[i]&&rows[i].sunLocked) return rows[i].timeIn||'';
  if(rows[i]&&rows[i].fixedIn&&rows[i].timeIn) return rows[i].timeIn;
  if(i===fn) return rows[i].timeIn||'';
  for(let j=i-1;j>=0;j--){
    if(rows[j].sunLocked) continue;
    return getTimeOut(j);
  }
  return'';
}
function getTimeOut(i){
  const r=rows[i]||{};
  if(r.sunLocked) return r.timeIn||'';
  if(r.fixedOut&&r.fixedOutTime) return r.fixedOutTime;
  const ti=getTimeIn(i),d=r.dur;
  if(!ti||!d)return'';
  const tm=t12m(ti),dm=durm(d);
  return(tm===null||dm===null)?'':m12(tm+dm);
}
function getNaturalTimeOut(i){
  const r=rows[i]||{};
  const ti=getTimeIn(i),d=r.dur;
  if(!ti||!d)return'';
  const tm=t12m(ti),dm=durm(d);
  return(tm===null||dm===null)?'':m12(tm+dm);
}
function nextFixedAnchorMin(i){
  for(let j=i+1;j<rows.length;j++){
    const r=rows[j];
    if(!r||r.sunLocked) continue;
    if(r.fixedIn&&r.timeIn){
      const m=t12m(r.timeIn); if(m!==null) return {idx:j,min:m,type:'in'};
    }
    if(r.fixedOut&&r.fixedOutTime){
      const m=t12m(r.fixedOutTime); if(m!==null) return {idx:j,min:m,type:'out'};
    }
  }
  return null;
}
function rowConflictInfo(i){
  const r=rows[i]||{};
  if(r.sunLocked) return null;
  const ti=getTimeIn(i), natural=getNaturalTimeOut(i);
  const tim=t12m(ti), natm=t12m(natural);
  if(r.fixedOut&&r.fixedOutTime&&natural&&natural!==r.fixedOutTime){
    return {kind:'fixedOutMismatch', msg:`Duration implies ${natural}; fixed out is ${r.fixedOutTime}.`};
  }
  const next=nextFixedAnchorMin(i);
  if(next&&natm!==null&&natm>next.min){
    return {kind:'overrun', msg:`Pushes past fixed ${next.type==='in'?'Time In':'Time Out'} on row ${next.idx+1}.`};
  }
  if(r.fixedOut&&r.fixedOutTime&&tim!==null){
    const out=t12m(r.fixedOutTime);
    if(out!==null&&out<tim) return {kind:'negative', msg:'Fixed Time Out is earlier than Time In.'};
  }
  return null;
}
function allowedDurationsForRow(i){
  const r=rows[i]||{};
  const ti=getTimeIn(i);
  const tim=t12m(ti);
  if(tim===null) return DURS;
  let max=null;
  if(r.fixedOut&&r.fixedOutTime){
    const out=t12m(r.fixedOutTime);
    if(out!==null && out>=tim) max=out-tim;
  }
  const next=nextFixedAnchorMin(i);
  if(next && next.min>=tim){
    const diff=next.min-tim;
    max=max===null?diff:Math.min(max,diff);
  }
  if(max===null) return DURS;
  return DURS.filter(d=>!d || (durm(d)!==null && durm(d)<=max));
}
function toggleFixedIn(i){
  recordUndoStep();
  rows[i].fixedIn=!rows[i].fixedIn;
  if(rows[i].fixedIn&&!rows[i].timeIn) rows[i].timeIn=getTimeIn(i)||'';
  render(); markDirty();
}
function toggleFixedOut(i){
  recordUndoStep();
  rows[i].fixedOut=!rows[i].fixedOut;
  if(rows[i].fixedOut&&!rows[i].fixedOutTime) rows[i].fixedOutTime=getNaturalTimeOut(i)||getTimeOut(i)||'';
  render(); markDirty();
}

/* ─────────────────────────────────────────────
   LOCK LOGIC
───────────────────────────────────────────── */
function isLocked(i){
  const fn=rows.findIndex(r=>!r.sunLocked);
  if(rows[i]&&rows[i].fixedIn) return false;
  if(i===fn) return false;
  for(let j=i-1;j>=0;j--){
    if(rows[j].sunLocked) continue;
    return !rows[j].dur;
  }
  return false;
}
function hasOpenRows(){
  return rows.some(r=>!r.sunLocked&&r.action!==''&&!r.dur);
}

/* ─────────────────────────────────────────────
   RENDER
───────────────────────────────────────────── */
function render(){
  const tbody=document.getElementById('sched-body');
  tbody.innerHTML='';
  const fn=rows.findIndex(r=>!r.sunLocked);

  rows.forEach((row,i)=>{
    const tr=document.createElement('tr');
    const has=row.action!=='';
    const isSun=!!row.sunLocked;
    const locked=!isSun&&isLocked(i);
    if(!has&&!isSun) tr.classList.add('inactive');
    if(isSun) tr.classList.add('sun-row');
    if(row.done&&has&&!isSun) tr.classList.add('completed');
    tr.dataset.idx=i;
    if(!isSun){
      tr.addEventListener('dragover',e=>{
        if(dragSrcIdx===null||dragSrcIdx===i) return;
        e.preventDefault(); e.dataTransfer.dropEffect='move';
        document.querySelectorAll('tr.drag-over').forEach(r=>r.classList.remove('drag-over'));
        tr.classList.add('drag-over');
      });
      tr.addEventListener('drop',e=>{
        e.preventDefault();
        document.querySelectorAll('tr.drag-over').forEach(r=>r.classList.remove('drag-over'));
        if(dragSrcIdx===null||dragSrcIdx===i) return;
        const fmov=rows.findIndex(r=>!r.sunLocked);
        if(i<fmov) return;
        const moved=rows.splice(dragSrcIdx,1)[0];
        const ni=dragSrcIdx<i?i-1:i;
        rows.splice(ni,0,moved);
        render(); markDirty();
      });
      tr.addEventListener('dragleave',()=>tr.classList.remove('drag-over'));
    } else {
      tr.dataset.locked='1';
    }

    // ── ROW NUM / DRAG ──
    const tdN=document.createElement('td'); tdN.className='rn';
    if(!isSun){
      const dh=document.createElement('span'); dh.className='drag-handle';
      dh.textContent='\u2630'; dh.title='Drag to reorder';
      dh.addEventListener('mousedown',()=>{
        if(hasOpenRows()){toast('Fill in Duration on all actions before reordering');return;}
        tdN.draggable=true;
      });
      tdN.addEventListener('dragstart',e=>{
        if(hasOpenRows()){e.preventDefault();return;}
        dragSrcIdx=i; e.dataTransfer.effectAllowed='move';
        setTimeout(()=>tr.classList.add('dragging'),0);
      });
      tdN.addEventListener('dragend',()=>{
        tr.classList.remove('dragging');
        document.querySelectorAll('tr.drag-over').forEach(r=>r.classList.remove('drag-over'));
        dragSrcIdx=null; tdN.draggable=false;
      });
      tdN.appendChild(dh);
      const mb=document.createElement('div'); mb.className='move-btns';
      const ub=document.createElement('button'); ub.className='move-btn'; ub.textContent='\u25B2';
      ub.disabled=(i===fn);
      ub.addEventListener('click',()=>{
        if(hasOpenRows()){toast('Fill in Duration on all actions before reordering');return;}
        const fmov=rows.findIndex(r=>!r.sunLocked);
        const ni=i-1; if(ni<fmov)return;
        [rows[i],rows[ni]]=[rows[ni],rows[i]]; render(); markDirty();
      });
      const db=document.createElement('button'); db.className='move-btn'; db.textContent='\u25BC';
      db.disabled=(i===rows.length-1);
      db.addEventListener('click',()=>{
        if(hasOpenRows()){toast('Fill in Duration on all actions before reordering');return;}
        const ni=i+1; if(ni>=rows.length)return;
        [rows[i],rows[ni]]=[rows[ni],rows[i]]; render(); markDirty();
      });
      mb.appendChild(ub); mb.appendChild(db); tdN.appendChild(mb);
    }
    const ns=document.createElement('span'); ns.style.cssText='display:block;font-size:10px;color:var(--g300)';
    ns.textContent=i+1; tdN.appendChild(ns);
    tr.appendChild(tdN);

    // ── ACTION ──
    const tdA=document.createElement('td');
    if(isSun){
      const lbl=document.createElement('div'); lbl.className='sun-label'; lbl.textContent=row.action;
      tdA.appendChild(lbl);
    } else {
      if(row.action==='Other'){
        // Show free-text input in place of the dropdown
        const wrap=document.createElement('div'); wrap.className='other-wrap';
        const inp=document.createElement('input');
        inp.type='text'; inp.className='other-inp-inline cs aOther';
        inp.placeholder='Describe\u2026'; inp.value=row.otherText||'';
        if(locked) inp.disabled=true;
        inp.addEventListener('input',e=>{rows[i].otherText=e.target.value;markDirty();});
        const back=document.createElement('button'); back.className='other-back'; back.title='Change action';
        back.textContent='\u21A9';
        back.addEventListener('click',()=>{rows[i].action='';rows[i].otherText='';recalc();markDirty();render();});
        wrap.appendChild(inp); wrap.appendChild(back);
        tdA.appendChild(wrap);
      } else {
        const sel=mkSel(ACTIONS,row.action,'cs');
        if(locked) sel.classList.add('locked');
        applyAC(sel,row.action);
        sel.addEventListener('change',e=>{
          rows[i].action=e.target.value;
          if(e.target.value==='Other'){rows[i].otherText='';recalc();markDirty();render();return;}
          applyAC(e.target,e.target.value);recalc();markDirty();
        });
        tdA.appendChild(sel);
      }
      if(locked){const h=document.createElement('div');h.className='lock-hint';h.textContent='\u23F1 Set duration above';tdA.appendChild(h);}
    }
    tr.appendChild(tdA);

    // ── LOCATION ──
    const tdL=document.createElement('td');
    if(!isSun){
      const wrap=document.createElement('div'); wrap.className='loc-wrap';
      const ta=mkTa(row.loc,has?'Location\u2026':'');
      ta.style.paddingRight=row.locLat?'22px':'';
      ta.addEventListener('input',e=>{
        rows[i].loc=e.target.value; rows[i].locLat=null; rows[i].locLng=null;
        ar(e.target); markDirty();
        const mb=wrap.querySelector('.loc-map-btn'); if(mb)mb.style.display='none';
        schedLocAc(e.target.value,i,wrap,ta);
      });
      wrap.appendChild(ta);
      const mb=document.createElement('button'); mb.className='loc-map-btn'; mb.textContent='\uD83D\uDCCD';
      mb.title='Get directions'; mb.style.display=row.locLat?'':'none';
      mb.addEventListener('click',e=>{
        e.preventDefault();
        const url=rows[i].locLat?
          `https://www.google.com/maps/dir/?api=1&destination=${rows[i].locLat},${rows[i].locLng}`:
          'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(rows[i].loc);
        window.open(url,'_blank');
      });
      wrap.appendChild(mb);
      const acd=document.createElement('div'); acd.className='loc-ac ac-dropdown'; wrap.appendChild(acd);
      tdL.appendChild(wrap);
      setTimeout(()=>ar(ta),0);
    }
    tr.appendChild(tdL);

    // ── DESCRIPTION ──
    const tdD=document.createElement('td');
    if(isSun&&row.desc){const n=document.createElement('div');n.className='sun-note';n.textContent=row.desc;tdD.appendChild(n);}
    else if(!isSun){const ta=mkTa(row.desc,has?'Description\u2026':'');ta.addEventListener('input',e=>{rows[i].desc=e.target.value;ar(e.target);markDirty();});tdD.appendChild(ta);setTimeout(()=>ar(ta),0);}
    tr.appendChild(tdD);

    // ── NOTES ──
    const tdNt=document.createElement('td');
    if(!isSun){const ta=mkTa(row.notes||'',has?'Notes\u2026':'');ta.addEventListener('input',e=>{rows[i].notes=e.target.value;ar(e.target);markDirty();});tdNt.appendChild(ta);setTimeout(()=>ar(ta),0);}
    tr.appendChild(tdNt);

    // ── DIVIDER ──
    const tdDv=document.createElement('td'); tdDv.className='col-dv'; tr.appendChild(tdDv);

    // ── TIME IN ──
    const tdTI=document.createElement('td'); tdTI.className='tc-t';
    if(isSun){
      const dv=document.createElement('div'); dv.className='tdsp';
      dv.style.fontWeight='700';
      dv.style.color=row.action.includes('Sunrise')?'#92400e':'#9a3412';
      dv.textContent=row.timeIn||''; tdTI.appendChild(dv);
    } else {
      const wrap=document.createElement('div'); wrap.className='time-cell-wrap';
      const lock=document.createElement('button'); lock.type='button';
      lock.className='time-lock-btn in'+(row.fixedIn?' active':'');
      lock.title=row.fixedIn?'Fixed start time':'Set fixed start time';
      lock.textContent='';
      lock.addEventListener('click',e=>{e.preventDefault();toggleFixedIn(i);});
      wrap.appendChild(lock);
      if(i===fn||row.fixedIn){
        const tSel=mkSel([''].concat(TIMES),row.timeIn||getTimeIn(i),'cs');
        tSel.options[0].textContent='— set —';
        tSel.disabled=locked&&!row.fixedIn;
        tSel.addEventListener('change',e=>{rows[i].timeIn=e.target.value;recalc();markDirty();});
        wrap.appendChild(tSel);
      } else {
        const dv=document.createElement('div'); dv.className='anchor-text';
        dv.textContent=getTimeIn(i)||''; wrap.appendChild(dv);
      }
      tdTI.appendChild(wrap);
    }
    tr.appendChild(tdTI);

    // ── DURATION ──
    const tdDu=document.createElement('td'); tdDu.className='tc-t';
    if(isSun){tdDu.appendChild(document.createElement('div'));}
    else{
      let dOpts=allowedDurationsForRow(i);
      if(row.dur&&!dOpts.includes(row.dur)) dOpts=[...dOpts,row.dur];
      const ds=mkSel(dOpts,row.dur,'cs');
      const conflict=rowConflictInfo(i);
      if(conflict) ds.classList.add('time-conflict');
      if(!row.action) ds.classList.add('locked');
      ds.addEventListener('change',e=>{rows[i].dur=e.target.value;recalc();markDirty();});
      tdDu.appendChild(ds);
      if(conflict){
        const warn=document.createElement('div'); warn.className='dur-warn'; warn.textContent=conflict.msg;
        tdDu.appendChild(warn);
      }
    }
    tr.appendChild(tdDu);

    // ── TIME OUT ──
    const tdTO=document.createElement('td'); tdTO.className='tc-t';
    if(isSun){
      const todv=document.createElement('div'); todv.className='tdsp tout';
      todv.textContent=getTimeOut(i)||''; tdTO.appendChild(todv);
    } else {
      const wrap=document.createElement('div'); wrap.className='time-cell-wrap';
      if(row.fixedOut){
        const outSel=mkSel([''].concat(TIMES),row.fixedOutTime||getTimeOut(i),'cs');
        outSel.options[0].textContent='— set —';
        if(rowConflictInfo(i)) outSel.classList.add('time-conflict');
        outSel.addEventListener('change',e=>{rows[i].fixedOutTime=e.target.value;render();markDirty();});
        wrap.appendChild(outSel);
      } else {
        const todv=document.createElement('div'); todv.className='tdsp tout';
        todv.textContent=getTimeOut(i)||''; wrap.appendChild(todv);
      }
      const lock=document.createElement('button'); lock.type='button';
      lock.className='time-lock-btn out'+(row.fixedOut?' active':'');
      lock.title=row.fixedOut?'Fixed end time':'Set fixed end time';
      lock.textContent='';
      lock.addEventListener('click',e=>{e.preventDefault();toggleFixedOut(i);});
      wrap.appendChild(lock);
      tdTO.appendChild(wrap);
    }
    tr.appendChild(tdTO);

    // ── DONE ──
    const tdDone=document.createElement('td'); tdDone.style.textAlign='center';
    if(!isSun){
      const cb=document.createElement('input'); cb.type='checkbox'; cb.className='done-cb'; cb.checked=!!row.done;
      cb.addEventListener('change',e=>{rows[i].done=e.target.checked;tr.classList.toggle('completed',e.target.checked&&has);markDirty();});
      tdDone.appendChild(cb);
    }
    tr.appendChild(tdDone);

    // ── DELETE ──
    const tdX=document.createElement('td');
    if(!isSun){
      const xb=document.createElement('button'); xb.className='del-btn'; xb.textContent='\u00D7'; xb.title='Remove row';
      xb.addEventListener('click',()=>{if(rows.length<=1)return;recordUndoStep();rows.splice(i,1);render();markDirty();});
      tdX.appendChild(xb);
    }
    tr.appendChild(tdX);

    tbody.appendChild(tr);
  });
  wireUndoCommitHandlers(tbody);
  updateUndoRedoButtons();
  updateCallTime();
}

function wireUndoCommitHandlers(root){
  if(!root) return;
  root.querySelectorAll('input, textarea, select').forEach(el=>{
    if(el.dataset.undoWired) return;
    el.dataset.undoWired='1';
    el.addEventListener('focus', beginUndoCapture);
    el.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !e.shiftKey && el.tagName!=='TEXTAREA'){
        setTimeout(commitUndoCapture,0);
      }
    });
    el.addEventListener('blur', commitUndoCapture);
    el.addEventListener('change', commitUndoCapture);
  });
}

function mkSel(opts,val,cls){
  const s=document.createElement('select'); s.className=cls;
  const list=Array.isArray(opts)?opts.slice():[];
  const current=(val==null?'':String(val));
  if(current && !list.includes(current)){
    const insertAt=list.includes('Other') ? list.indexOf('Other') : list.length;
    list.splice(insertAt,0,current);
  }
  list.forEach(o=>{
    const op=document.createElement('option');
    op.value=o;
    op.textContent=o||'\u2014';
    if(o===val) op.selected=true;
    s.appendChild(op);
  });
  return s;
}
function mkTa(val,ph){
  const t=document.createElement('textarea');
  t.className='ci-ta'; t.value=val; t.placeholder=ph; t.rows=1; t.spellcheck=true;
  return t;
}
function ar(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
function applyAC(el,val){el.className='cs';const c=A_CLASS[val];if(c)el.classList.add(c);}
function recalc(){
  if(wxData&&wxData.sunrise&&wxData.sunset){insertSunRows(wxData.sunrise,wxData.sunset);}
  else{render();}
}
function updateCallTime(){
  let ct='\u2014';
  const fn=rows.findIndex(r=>!r.sunLocked);
  for(let i=0;i<rows.length;i++){
    if(rows[i].sunLocked) continue;
    if(rows[i].action==='Crew Call'){
      const t=(i===fn)?rows[i].timeIn:getTimeIn(i);
      if(t){ct=t;break;}
    }
  }
  document.getElementById('call-disp').textContent=ct;
}
function addRow(){recordUndoStep();rows.push(makeRow());render();markDirty();}

/* ─────────────────────────────────────────────
   TOWN AUTOCOMPLETE (Google Places New)
───────────────────────────────────────────── */
function onTownInput(){
  markDirty(); selLat=null; selLng=null; selDisp='';
  document.getElementById('town-map-btn').style.display='none';
  hideWx();
  const q=document.getElementById('m-town').value.trim();
  clearTimeout(acTownTimer);
  const dd=document.getElementById('ac-town');
  if(q.length<2){dd.classList.remove('open');dd.innerHTML='';return;}
  acTownTimer=setTimeout(()=>doTownSearch(q),350);
}

async function doTownSearch(q){
  const dd=document.getElementById('ac-town');
  dd.innerHTML='<div class="ac-loading">Searching\u2026</div>';
  dd.classList.add('open');
  const results=await googlePlacesSearch(q);
  if(results){
    acTownResults=results;
    acTownIdx=-1; renderTownAc();
  } else {
    nominatimTownSearch(q);
  }
}

async function nominatimTownSearch(q){
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,{headers:{'Accept-Language':'en-US,en'}});
    const data=await res.json();
    acTownResults=data.map(r=>({label:r.display_name,lat:parseFloat(r.lat),lng:parseFloat(r.lon),isGoogle:false}));
    acTownIdx=-1; renderTownAc();
  }catch(e){
    document.getElementById('ac-town').innerHTML='<div class="ac-loading">Search unavailable</div>';
  }
}

function renderTownAc(){
  const dd=document.getElementById('ac-town');
  if(!acTownResults.length){dd.innerHTML='<div class="ac-loading">No results</div>';return;}
  dd.innerHTML='';
  acTownResults.forEach((r,i)=>{
    const item=document.createElement('div'); item.className='ac-item';
    if(r.isGoogle){
      item.innerHTML=`<strong>${r.main}</strong>${r.sec?', '+r.sec:''}`;
    } else {
      const p=r.label.split(',');
      item.innerHTML=`<strong>${p[0]}</strong>${p.length>1?','+p.slice(1).join(','):''}`;
    }
    item.addEventListener('mousedown',e=>{e.preventDefault();selectTown(i);});
    dd.appendChild(item);
  });
  dd.classList.add('open');
}

function selectTown(idx){
  const r=acTownResults[idx];
  if(!r) return;
  document.getElementById('m-town').value=r.label;
  selDisp=r.label;
  document.getElementById('ac-town').classList.remove('open');
  document.getElementById('ac-town').innerHTML='';
  document.getElementById('town-map-btn').style.display='inline-block';
  if(r.isGoogle){
    selDisp=r.label;
    document.getElementById('m-town').value=r.label;
    document.getElementById('ac-town').classList.remove('open');
    document.getElementById('ac-town').innerHTML='';
    document.getElementById('town-map-btn').style.display='inline-block';
    googleGeocode(r.placeId, r.main || r.label || '').then(coords=>{
      if(coords){
        selLat=coords.lat;selLng=coords.lng;
        if(coords.address){
          selDisp=coords.address;
          document.getElementById('m-town').value=coords.address;
        }
      }
      const date=document.getElementById('m-date').value;
      if(date&&selLat) fetchWeather(false);
    });
  } else {
    selLat=r.lat; selLng=r.lng;
    const date=document.getElementById('m-date').value;
    if(date) fetchWeather(false);
  }
  markDirty();
}

function onTownKey(e,which){
  const dd=document.getElementById('ac-'+which);
  if(!dd.classList.contains('open')) return;
  const items=dd.querySelectorAll('.ac-item');
  if(e.key==='ArrowDown'){e.preventDefault();acTownIdx=Math.min(acTownIdx+1,items.length-1);items.forEach((it,i)=>it.classList.toggle('focused',i===acTownIdx));}
  else if(e.key==='ArrowUp'){e.preventDefault();acTownIdx=Math.max(acTownIdx-1,0);items.forEach((it,i)=>it.classList.toggle('focused',i===acTownIdx));}
  else if(e.key==='Enter'){e.preventDefault();if(acTownIdx>=0)selectTown(acTownIdx);else dd.classList.remove('open');}
  else if(e.key==='Escape'){dd.classList.remove('open');}
}

function openTownMap(){
  const town=document.getElementById('m-town').value.trim();
  if(!town) return;
  const url=selLat?
    `https://www.google.com/maps/search/?api=1&query=${selLat},${selLng}`:
    `https://www.google.com/maps/search/${encodeURIComponent(town)}`;
  window.open(url,'_blank');
}

/* ─────────────────────────────────────────────
   LOCATION ROW AUTOCOMPLETE
───────────────────────────────────────────── */
function schedLocAc(q,rowIdx,wrap,ta){
  clearTimeout(locAcTimers[rowIdx]);
  const acd=wrap.querySelector('.loc-ac');
  if(!q||q.length<2){acd.classList.remove('open');acd.innerHTML='';return;}
  locAcTimers[rowIdx]=setTimeout(()=>doLocSearch(q,rowIdx,wrap,ta),380);
}

async function doLocSearch(q,rowIdx,wrap,ta){
  const acd=wrap.querySelector('.loc-ac');
  acd.innerHTML='<div class="ac-loading">Searching\u2026</div>'; acd.classList.add('open');
  const results=await googlePlacesSearch(q);
  if(results){
    acd.innerHTML='';
    results.slice(0,5).forEach(p=>{
      const item=document.createElement('div'); item.className='ac-item';
      item.innerHTML=`<strong>${p.main}</strong>${p.sec?', '+p.sec:''}`;
      item.addEventListener('mousedown',e=>{
        e.preventDefault();
        rows[rowIdx].loc=p.label;
        ta.value=p.label; ar(ta);
        acd.classList.remove('open'); acd.innerHTML='';
        const mb=wrap.querySelector('.loc-map-btn'); if(mb)mb.style.display='';
        googleGeocode(p.placeId, p.main || p.label || '').then(coords=>{
          if(coords){
            rows[rowIdx].locLat=coords.lat; rows[rowIdx].locLng=coords.lng;
            if(coords.address){
              rows[rowIdx].loc=coords.address;
              ta.value=coords.address; ar(ta);
            }
          }
        });
        markDirty();
      });
      acd.appendChild(item);
    });
  } else {
    nominatimLocSearch(q,rowIdx,wrap,ta);
  }
}

async function nominatimLocSearch(q,rowIdx,wrap,ta){
  const acd=wrap.querySelector('.loc-ac');
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,{headers:{'Accept-Language':'en-US,en'}});
    const data=await res.json();
    if(!data.length){acd.innerHTML='<div class="ac-loading">No results</div>';return;}
    acd.innerHTML='';
    data.forEach(r=>{
      const item=document.createElement('div'); item.className='ac-item';
      const p=r.display_name.split(',');
      item.innerHTML=`<strong>${p[0]}</strong>${p.length>1?','+p.slice(1).join(','):''}`;
      item.addEventListener('mousedown',e=>{
        e.preventDefault();
        rows[rowIdx].loc=r.display_name; rows[rowIdx].locLat=parseFloat(r.lat); rows[rowIdx].locLng=parseFloat(r.lon);
        ta.value=r.display_name; ar(ta);
        const mb=wrap.querySelector('.loc-map-btn'); if(mb)mb.style.display='';
        acd.classList.remove('open'); acd.innerHTML=''; markDirty();
      });
      acd.appendChild(item);
    });
  }catch(e){acd.innerHTML='<div class="ac-loading">Search unavailable</div>';}
}

/* ─────────────────────────────────────────────
   CREW NAME MEMORY
───────────────────────────────────────────── */
const CREW_KEY='rp_crew';
function getCrewNames(){try{return JSON.parse(localStorage.getItem(CREW_KEY)||'{}')}catch(e){return{};}}
function saveCrewName(role,name){
  if(!name||name.trim().length<2) return;
  const all=getCrewNames(); if(!all[role])all[role]=[];
  const n=name.trim();
  if(!all[role].includes(n)){all[role].unshift(n);all[role]=all[role].slice(0,20);}
  try{localStorage.setItem(CREW_KEY,JSON.stringify(all));}catch(e){}
}
function onCrewInput(role){
  const q=document.getElementById('m-'+role).value.trim();
  const names=getCrewNames()[role]||[];
  const matches=q?names.filter(n=>n.toLowerCase().includes(q.toLowerCase())):names;
  renderCrewDd(role,matches);
}
function onCrewFocus(role){
  const names=getCrewNames()[role]||[];
  if(names.length) renderCrewDd(role,names);
}
function renderCrewDd(role,names){
  const dd=document.getElementById('ac-'+role);
  if(!names.length){dd.classList.remove('open');dd.innerHTML='';return;}
  dd.innerHTML='';
  names.slice(0,8).forEach(n=>{
    const item=document.createElement('div'); item.className='ac-item'; item.textContent=n;
    item.addEventListener('mousedown',e=>{
      e.preventDefault();
      document.getElementById('m-'+role).value=n;
      dd.classList.remove('open'); dd.innerHTML=''; markDirty();
    });
    dd.appendChild(item);
  });
  dd.classList.add('open');
}
function onCrewKey(e,role){
  const dd=document.getElementById('ac-'+role);
  if(!dd.classList.contains('open')) return;
  const items=[...dd.querySelectorAll('.ac-item')];
  if(e.key==='Escape'){dd.classList.remove('open');dd.innerHTML='';}
  else if(e.key==='ArrowDown'){e.preventDefault();const f=dd.querySelector('.focused');const idx=items.indexOf(f);if(f)f.classList.remove('focused');(items[idx+1]||items[0])?.classList.add('focused');}
  else if(e.key==='ArrowUp'){e.preventDefault();const f=dd.querySelector('.focused');const idx=items.indexOf(f);if(f)f.classList.remove('focused');(items[idx-1]||items[items.length-1])?.classList.add('focused');}
  else if(e.key==='Enter'){e.preventDefault();const f=dd.querySelector('.focused');if(f)f.dispatchEvent(new MouseEvent('mousedown'));}
}

/* ─────────────────────────────────────────────
   DATE CHANGE
───────────────────────────────────────────── */
function onDateChange(){
  markDirty();
  const el=document.getElementById('m-date');
  el.style.color=el.value?'':'transparent';
  clearWxAndSun();
  if(selLat&&selLng&&el.value) fetchWeather(false);
}

/* ─────────────────────────────────────────────
   WEATHER
───────────────────────────────────────────── */
function clearWxAndSun(){
  document.getElementById('wx-strip').classList.remove('show');
  wxData=null; rows=rows.filter(r=>!r.sunLocked); render();
}
function hideWx(){clearWxAndSun();}

async function fetchWeather(manual){
  const date=document.getElementById('m-date').value;
  if(!selLat||!selLng||!date){if(manual)toast('Select a location and set a date first');return;}
  const today=new Date(); today.setHours(0,0,0,0);
  const shoot=new Date(date+'T12:00:00');
  const diff=Math.round((shoot-today)/(86400000));
  if(diff>16){fetchSunOnly(date,manual);return;}
  if(diff<-1){clearWxAndSun();if(manual)toast('No forecast for past dates');return;}
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${selLat}&longitude=${selLng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset&temperature_unit=celsius&timezone=auto&start_date=${date}&end_date=${date}`;
    const res=await fetch(url); const wx=await res.json();
    if(!wx.daily||!wx.daily.time||!wx.daily.time.length){fetchSunOnly(date,manual);return;}
    const d=wx.daily;
    // Open-Meteo returns sunrise/sunset as local time strings ("YYYY-MM-DDTHH:MM")
    // already adjusted for the location's timezone — rawToAP just parses HH:MM.
    const srStr=rawToAP(d.sunrise[0].slice(11));
    const ssStr=rawToAP(d.sunset[0].slice(11));
    const maxC=d.temperature_2m_max[0],minC=d.temperature_2m_min[0];
    const prec=d.precipitation_probability_max[0];
    const code=d.weathercode[0];
    wxData={sunrise:srStr,sunset:ssStr,maxC,minC,maxF:cToF(maxC),minF:cToF(minC),
      prec,code,cond:WX_CODES[code]||'Unknown',
      fetchedAt:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),
      town:document.getElementById('m-town').value};
    renderWx(wxData); insertSunRows(srStr,ssStr);
    toast(manual?'Weather updated \u2713':'Weather loaded \u2713');
  }catch(err){if(manual)toast('Could not load weather');}
}

function rawToAP(hhmm){
  const[h,m]=hhmm.split(':').map(Number);
  const hh=h%12===0?12:h%12,ap=h<12?'AM':'PM';
  return`${hh}:${String(m).padStart(2,'0')} ${ap}`;
}

// Pure-JS astronomical sunrise/sunset calculation (NOAA algorithm).
// Works for any date, any location. DST-aware when a valid IANA timezone is supplied.
function calcSunTimes(dateStr, lat, lng, ianaTimezone){
  const D2R=Math.PI/180, R2D=180/Math.PI;
  const [yr,mo,dy]=dateStr.split('-').map(Number);
  const JD=(367*yr - Math.floor(7*(yr+Math.floor((mo+9)/12))/4)
    + Math.floor(275*mo/9) + dy + 1721013.5);
  const n=JD-2451545.0;
  const L=(280.460+0.9856474*n)%360;
  const g=(357.528+0.9856003*n)%360;
  const lam=L+1.915*Math.sin(g*D2R)+0.020*Math.sin(2*g*D2R);
  const ep=23.439-0.0000004*n;
  const sinDec=Math.sin(ep*D2R)*Math.sin(lam*D2R);
  const dec=Math.asin(sinDec)*R2D;
  const cosH=(-Math.tan(lat*D2R)*Math.tan(dec*D2R));
  if(cosH<-1) return null; // polar day
  if(cosH>1)  return null; // polar night
  const H=Math.acos(cosH)*R2D;
  const RA=(Math.atan2(Math.cos(ep*D2R)*Math.sin(lam*D2R),Math.cos(lam*D2R))*R2D+360)%360;
  const EqT=L-RA;
  const noon=12-(lng/15)-(EqT/15);
  const srUTC=noon-H/15, ssUTC=noon+H/15;

  // Get the UTC offset for this specific date in the location's timezone.
  // Intl.DateTimeFormat knows DST rules and applies them for the exact date.
  let offsetHours=-(new Date(dateStr+'T12:00:00Z').getTimezoneOffset()/60); // browser fallback
  if(ianaTimezone){
    try{
      // Parse what UTC noon looks like in the target timezone on this date
      const parts=new Intl.DateTimeFormat('en-US',{
        timeZone:ianaTimezone,hour:'numeric',minute:'numeric',hour12:false,
        year:'numeric',month:'2-digit',day:'2-digit'
      }).formatToParts(new Date(dateStr+'T12:00:00Z'));
      const p={};parts.forEach(x=>p[x.type]=x.value);
      // noon UTC = 12:00, local hour tells us the offset
      const localHour=parseInt(p.hour,10);
      const localMin=parseInt(p.minute,10);
      offsetHours=(localHour+localMin/60)-12;
      // Handle day-wrap edge cases (e.g. UTC+13)
      if(offsetHours<-14) offsetHours+=24;
      if(offsetHours>14)  offsetHours-=24;
    }catch(e){}
  }

  function fmtLocal(utcH){
    const total=((utcH+offsetHours)%24+24)%24;
    const hh=Math.floor(total), mm=Math.round((total-hh)*60);
    return rawToAP(String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'));
  }
  return{sunrise:fmtLocal(srUTC),sunset:fmtLocal(ssUTC)};
}

async function fetchSunOnly(date,manual){
  // Open-Meteo returns sunrise/sunset as local time strings ("YYYY-MM-DDTHH:MM")
  // already adjusted for the location's timezone — no UTC conversion needed.
  // Forecast API covers ~16 days ahead; historical API covers past dates.
  // Final fallback: pure-JS astronomical calculation (no API, always works).
  const urls=[
    `https://api.open-meteo.com/v1/forecast?latitude=${selLat}&longitude=${selLng}&daily=sunrise,sunset&timezone=auto&start_date=${date}&end_date=${date}`,
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${selLat}&longitude=${selLng}&daily=sunrise,sunset&timezone=auto&start_date=${date}&end_date=${date}`
  ];
  // Also fetch the IANA timezone for this location from Open-Meteo using today's
  // date. This always succeeds regardless of shoot date, and gives us the
  // timezone name so the JS fallback can apply correct DST for any future date.
  let ianaTimezone=null;
  try{
    const today=new Date().toISOString().slice(0,10);
    const tzRes=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${selLat}&longitude=${selLng}&daily=sunrise&timezone=auto&start_date=${today}&end_date=${today}`);
    const tzJ=await tzRes.json();
    if(tzJ.timezone&&tzJ.timezone!=='GMT'&&tzJ.timezone!=='UTC') ianaTimezone=tzJ.timezone;
  }catch(e){}

  let srStr=null,ssStr=null;
  for(const url of urls){
    try{
      const r=await fetch(url); const j=await r.json();
      if(j.daily&&j.daily.sunrise&&j.daily.sunrise.length){
        srStr=rawToAP(j.daily.sunrise[0].slice(11));
        ssStr=rawToAP(j.daily.sunset[0].slice(11));
        break;
      }
    }catch(e){}
  }
  // Fallback: calculate astronomically with DST-aware offset
  if(!srStr){
    const calc=calcSunTimes(date,selLat,selLng,ianaTimezone);
    if(!calc){if(manual)toast('Could not load sun data');return;}
    srStr=calc.sunrise; ssStr=calc.sunset;
  }
  document.getElementById('wx-sr').textContent='\uD83C\uDF05 '+srStr;
  document.getElementById('wx-ss').textContent='\uD83C\uDF07 '+ssStr;
  document.getElementById('wx-tmp').textContent='Forecast not yet available';
  document.getElementById('wx-cond').textContent='\u2014';
  document.getElementById('wx-prec').textContent='\u2014';
  document.getElementById('wx-ts').textContent='Sun times only';
  document.getElementById('wx-strip').classList.add('show');
  wxData={sunrise:srStr,sunset:ssStr,noForecast:true};
  insertSunRows(srStr,ssStr);
  toast('Sunrise & sunset loaded \u2713');
}

function renderWx(d){
  document.getElementById('wx-sr').textContent='\uD83C\uDF05 '+d.sunrise;
  document.getElementById('wx-ss').textContent='\uD83C\uDF07 '+d.sunset;
  document.getElementById('wx-tmp').textContent=`${d.maxF}\u00B0F / ${d.minF}\u00B0F`;
  document.getElementById('wx-cond').textContent=wxIcon(d.code)+' '+d.cond;
  const search=encodeURIComponent((d.town||'').split(',')[0].trim()+' weather');
  document.getElementById('wx-prec').innerHTML=`${d.prec}% &nbsp;<a href="https://www.google.com/search?q=${search}" target="_blank" rel="noopener" style="color:#38bdf8;font-size:11px">Google Weather \u2197</a>`;
  document.getElementById('wx-ts').textContent=d.fetchedAt;
  document.getElementById('wx-strip').classList.add('show');
}

function insertSunRows(srStr,ssStr){
  rows=rows.filter(r=>!r.sunLocked);
  const srMin=t12m(srStr),ssMin=t12m(ssStr);
  const times=rows.map((_,i)=>({in:t12m(getTimeIn(i)),out:t12m(getTimeOut(i))}));
  const hasT=times.some(t=>t.in!==null);

  function findPt(timeMin,label){
    if(timeMin===null) return null;
    const evtName=label.includes('Sunrise')?'Sunrise':'Sunset';
    for(let i=0;i<times.length;i++){
      const{in:inM,out:outM}=times[i];
      if(inM!==null&&timeMin<=inM) return{idx:i,note:''};
      if(inM!==null&&outM!==null&&timeMin>inM&&timeMin<outM&&rows[i].action)
        return{idx:i+1,note:evtName+' during: '+rows[i].action};
    }
    return{idx:rows.length,note:''};
  }

  let srPt,ssPt;
  if(!hasT){srPt={idx:0,note:''};ssPt={idx:1,note:''};}
  else{srPt=findPt(srMin,'\uD83C\uDF05 Sunrise');ssPt=findPt(ssMin,'\uD83C\uDF07 Sunset');}

  const inserts=[];
  if(srPt) inserts.push({pt:srPt,label:'\uD83C\uDF05 Sunrise',time:srStr});
  if(ssPt) inserts.push({pt:ssPt,label:'\uD83C\uDF07 Sunset',time:ssStr});
  inserts.sort((a,b)=>b.pt.idx-a.pt.idx);
  inserts.forEach(({pt,label,time})=>{
    rows.splice(pt.idx,0,{...makeRow(),action:label,sunLocked:true,timeIn:time,desc:pt.note});
  });
  render(); markDirty();
}

/* ─────────────────────────────────────────────
   STORAGE — Netlify Blobs via Functions
   Local cache + offline queue + snapshots
───────────────────────────────────────────── */
const LS_SCHED_KEY='rp_scheds';
const LS_QUEUE_KEY='rp_sched_queue';
const LS_SNAP_KEY='rp_sched_snaps';
const LS_SYNC_META_KEY='rp_sync_meta';
const LS_DELETE_TOMBSTONES_KEY='rp_sched_deleted';
const DELETE_TOMBSTONE_TTL=10*60*1000;
let syncState='synced';

function readJSON(key, fallback){
  try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}
  catch(e){return fallback;}
}
function writeJSON(key, value){
  try{localStorage.setItem(key, JSON.stringify(value)); return true;}
  catch(e){console.error('localStorage write failed for', key, e); return false;}
}

function getAllTpl(){return readJSON('rp_tpls',{});}
function saveAllTpl(d){writeJSON('rp_tpls', d);}

function getLocalSchedules(){return readJSON(LS_SCHED_KEY, {});}
function saveLocalSchedules(d){writeJSON(LS_SCHED_KEY, d);}
function cacheSchedule(name, data){
  const all=getLocalSchedules(); all[name]=data; saveLocalSchedules(all);
}
function removeCachedSchedule(name){
  const all=getLocalSchedules(); delete all[name]; saveLocalSchedules(all);
}
function getDeleteTombstones(){
  const all=readJSON(LS_DELETE_TOMBSTONES_KEY, {});
  const now=Date.now();
  let dirty=false;
  Object.keys(all).forEach(name=>{
    if(!all[name] || (now-all[name])>DELETE_TOMBSTONE_TTL){ delete all[name]; dirty=true; }
  });
  if(dirty) writeJSON(LS_DELETE_TOMBSTONES_KEY, all);
  return all;
}
function markDeletedSchedule(name){
  const all=getDeleteTombstones();
  all[name]=Date.now();
  writeJSON(LS_DELETE_TOMBSTONES_KEY, all);
}
function clearDeletedSchedule(name){
  const all=getDeleteTombstones();
  if(name in all){ delete all[name]; writeJSON(LS_DELETE_TOMBSTONES_KEY, all); }
}
function isScheduleDeletedLocally(name){
  return !!getDeleteTombstones()[name];
}

function getSyncQueue(){return readJSON(LS_QUEUE_KEY, []);}
function saveSyncQueue(q){writeJSON(LS_QUEUE_KEY, q);}
function getSyncMeta(){return readJSON(LS_SYNC_META_KEY, {lastSyncedAt:null, remoteSavedAt:{}});}
function saveSyncMeta(meta){writeJSON(LS_SYNC_META_KEY, meta);}
function getKnownRemoteSavedAt(name){
  const meta=getSyncMeta();
  return meta.remoteSavedAt?.[name] || 0;
}
function setKnownRemoteSavedAt(name, savedAt){
  const meta=getSyncMeta();
  if(!meta.remoteSavedAt) meta.remoteSavedAt={};
  meta.remoteSavedAt[name]=savedAt||0;
  saveSyncMeta(meta);
}
function removeKnownRemoteSavedAt(name){
  const meta=getSyncMeta();
  if(meta.remoteSavedAt && name in meta.remoteSavedAt){
    delete meta.remoteSavedAt[name];
    saveSyncMeta(meta);
  }
}
function setLastSyncedAt(ts){
  const meta=getSyncMeta();
  meta.lastSyncedAt=ts||Date.now();
  saveSyncMeta(meta);
}
function formatSyncTime(ts){
  if(!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function queueSave(name, data){
  const q=getSyncQueue().filter(item=>item.name!==name);
  q.push({
    type:'save',
    name,
    data,
    queuedAt:Date.now(),
    localSavedAt:data?.savedAt||Date.now(),
    knownRemoteSavedAt:getKnownRemoteSavedAt(name)||0,
    conflict:false
  });
  saveSyncQueue(q);
}
function queueDelete(name){
  const q=getSyncQueue().filter(item=>item.name!==name);
  q.push({
    type:'delete',
    name,
    queuedAt:Date.now(),
    knownRemoteSavedAt:getKnownRemoteSavedAt(name)||0,
    conflict:false
  });
  saveSyncQueue(q);
}
function saveSnapshot(name, data, label='Auto snapshot'){
  if(!name) return;
  const snaps=readJSON(LS_SNAP_KEY, {});
  const arr=snaps[name]||[];
  arr.unshift({savedAt:Date.now(), label, data});
  snaps[name]=arr.slice(0,10);
  writeJSON(LS_SNAP_KEY, snaps);
}
function getSnapshots(name){
  const snaps=readJSON(LS_SNAP_KEY, {});
  return snaps[name]||[];
}
function getSnapshotCount(name){
  return getSnapshots(name).length;
}
let versionTargetName='';
function createManualSnapshot(){
  const name=curName||prompt('Create a snapshot for which schedule name?', curName||'');
  if(!name) return;
  const schedule={meta:getMeta(), rows:JSON.parse(JSON.stringify(rows)), savedAt:Date.now()};
  cacheSchedule(name, schedule);
  saveSnapshot(name, schedule, 'Manual snapshot');
  renderVersionPicker(name);
  toast('Snapshot created — you can restore it later from Versions / Restore');
}
function openVersionsFor(name){
  versionTargetName=name;
  openLib();
  switchTab('versions');
}
async function renderVersionPicker(name){
  const sel=document.getElementById('ver-schedule-select');
  if(!sel) return;
  const keys=await blobList();
  sel.innerHTML='';
  if(!keys.length){
    sel.innerHTML='<option value="">No saved schedules in My Library</option>';
    renderVersionList('');
    return;
  }
  keys.forEach(k=>{
    const opt=document.createElement('option');
    opt.value=k;
    opt.textContent=k;
    if(k===name) opt.selected=true;
    sel.appendChild(opt);
  });
  const chosen = name && keys.includes(name) ? name : (curName && keys.includes(curName) ? curName : keys[0]);
  sel.value = chosen;
  versionTargetName = chosen;
  renderVersionList(chosen);
}
function selectVersionSchedule(name){
  versionTargetName=name||'';
  renderVersionList(versionTargetName);
}
function renderVersionList(name){
  versionTargetName=name||'';
  const el=document.getElementById('ver-list');
  const title=document.getElementById('ver-selected-name');
  if(!el || !title) return;
  title.textContent = name ? `Selected: ${name}` : 'No schedule selected';
  if(!name){
    el.innerHTML='<div class="ver-empty">Choose a saved schedule first, then use Versions / Restore to preview, restore, or delete snapshots.</div>';
    return;
  }
  const snaps=getSnapshots(name);
  if(!snaps.length){
    el.innerHTML='<div class="ver-empty">No snapshots yet for this schedule. Use <b>Snapshot</b> in the toolbar to save a restore point.</div>';
    return;
  }
  el.innerHTML='';
  snaps.forEach((snap, idx)=>{
    const row=document.createElement('div');
    row.className='ver-item';
    const time=new Date(snap.savedAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    const actCount=(snap.data?.rows||[]).filter(r=>r.action && !r.sunLocked).length;
    row.innerHTML=`<div class="ver-meta"><div class="ver-title">${time}<span class="snapshot-badge">${snap.label||'Snapshot'}</span></div><div class="ver-sub">${actCount} actions</div></div><div class="ver-acts"><button class="btn btn-light btn-sm" onclick="previewSnapshot('${name.replace(/'/g,"\\'")}',${idx})">Preview</button><button class="btn btn-pink btn-sm" onclick="restoreSnapshot('${name.replace(/'/g,"\\'")}',${idx})">Restore</button><button class="btn btn-light btn-sm" onclick="deleteSnapshot('${name.replace(/'/g,"\\'")}',${idx})">Delete</button></div>`;
    el.appendChild(row);
  });
}
function previewSnapshot(name, idx){
  const snap=getSnapshots(name)[idx];
  if(!snap) return;
  const meta=snap.data?.meta||{};
  const acts=(snap.data?.rows||[]).filter(r=>r.action && !r.sunLocked).length;
  alert(`Snapshot: ${snap.label||'Snapshot'}\nSaved: ${new Date(snap.savedAt).toLocaleString()}\nTown: ${meta.town||''}\nDate: ${meta.date||''}\nActions: ${acts}`);
}
function deleteSnapshot(name, idx){
  const snaps = getSnapshots(name);
  const snap = snaps[idx];
  if(!snap) return;
  const label = snap.label || 'Snapshot';
  if(!confirm(`Delete this snapshot from "${name}"?\n\nThis only removes the snapshot. The saved schedule will stay in My Library.`)) return;
  snaps.splice(idx, 1);
  localStorage.setItem(snapshotKey(name), JSON.stringify(snaps));
  renderVersionPicker(name);
  toast(`${label} deleted — saved schedule kept`);
}
async function restoreSnapshot(name, idx){
  recordUndoStep();
  const snap=getSnapshots(name)[idx];
  if(!snap) return;
  if(!confirm(`Restore this snapshot to "${name}"?\n\nThis will replace the current working version of that schedule.`)) return;
  const current={meta:getMeta(), rows:JSON.parse(JSON.stringify(rows)), savedAt:Date.now()};
  if(curName===name || (!curName && name)){
    saveSnapshot(name, current, 'Before restore');
  }
  const restored=JSON.parse(JSON.stringify(snap.data||{}));
  restored.savedAt=Date.now();
  cacheSchedule(name, restored);
  saveSnapshot(name, restored, 'Restored snapshot');
  if(curName===name || !curName){
    clearAll();
    rows=(restored.rows||[]).map(r=>({...makeRow(),...r}));
    setMeta(restored.meta||{});
    curName=name; isDirty=false;
    document.getElementById('sched-label').textContent=name;
    render();
  }
  await blobSave(name, restored);
  renderVersionPicker(name);
  renderSchedList();
  toast('Snapshot restored — schedule updated');
}
function setSyncStatus(state, textMsg){
  syncState=state;
  const el=document.getElementById('sync-status');
  if(!el) return;
  el.className='sync-pill '+state;
  const txt=el.querySelector('.txt');
  if(txt) txt.textContent=textMsg;
  el.title=textMsg;
}
function refreshSyncStatus(){
  const q=getSyncQueue();
  const conflicts=q.filter(i=>i.conflict).length;
  const pending=q.length - conflicts;
  const lastSync=formatSyncTime(getSyncMeta().lastSyncedAt);
  const meta=document.getElementById('lib-sync-meta');
  if(meta){
    const pieces=[];
    if(lastSync) pieces.push('Last synced '+lastSync);
    if(pending) pieces.push(`${pending} pending`);
    if(conflicts) pieces.push(`${conflicts} conflict${conflicts===1?'':'s'}`);
    meta.textContent=pieces.join(' · ');
  }
  if(!navigator.onLine){
    if(conflicts) { setSyncStatus('offline', `Offline · ${pending} pending · ${conflicts} conflict`); return; }
    setSyncStatus('offline', pending?`Offline · ${pending} pending`:'Offline');
    return;
  }
  if(syncState==='syncing'){setSyncStatus('syncing','Syncing…'); return;}
  if(conflicts){setSyncStatus('pending', `Review needed · ${conflicts} conflict${conflicts===1?'':'s'}`); return;}
  if(pending){setSyncStatus('pending', `Pending sync · ${pending}${lastSync?' · '+lastSync:''}`); return;}
  setSyncStatus('synced', lastSync?`Synced · ${lastSync}`:'Synced');
}

async function remoteSave(name, data, deleted=false, deletePassword=''){
  if(!IS_READ_ONLY_LINK && !editorToken) throw new Error('Editor login required');
  const body=deleted?{name,data:null,deleted:true,editorToken,deletePassword}:{name,data,editorToken};
  const res=await fetch('/.netlify/functions/save',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!res.ok){
    const err=await res.json().catch(()=>({error:'Unknown error'}));
    const msg=err.error||('Save failed: HTTP '+res.status);
    if(res.status===403 && !/delete password/i.test(msg) && !/invalid delete/i.test(msg)){
      setEditorToken('');
      showLogin(msg);
    }
    throw new Error(msg);
  }
  return true;
}
async function remoteLoad(name){
  const params=new URLSearchParams({name});
  if(editorToken) params.set('editorToken',editorToken);
  const vt=new URLSearchParams(window.location.search).get('vt');
  if(vt) params.set('viewToken',vt);
  const res=await fetch(`/.netlify/functions/load?${params.toString()}`);
  if(res.status===404) return null;
  if(res.status===403) throw new Error('Unauthorized');
  if(!res.ok) throw new Error('Load failed');
  return await res.json();
}
async function remoteList(){
  if(!editorToken) throw new Error('Editor login required');
  const res=await fetch(`/.netlify/functions/load?editorToken=${encodeURIComponent(editorToken)}`);
  if(res.status===403){
    setEditorToken('');
    showLogin('Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }
  if(!res.ok) throw new Error('List failed');
  const d=await res.json();
  return d.schedules||[];
}

async function blobSave(name, data){
  clearDeletedSchedule(name);
  cacheSchedule(name, data);
  saveSnapshot(name, data, 'Auto snapshot');
  if(!navigator.onLine){
    if(e&&/Unauthorized|Editor login required/i.test(e.message||'')){throw e;}
    queueSave(name, data);
    refreshSyncStatus();
    toast('Saved locally — waiting to sync when you are back online');
    return true;
  }
  try{
    await remoteSave(name, data, false);
    setKnownRemoteSavedAt(name, data?.savedAt||Date.now());
    const q=getSyncQueue().filter(item=>item.name!==name);
    saveSyncQueue(q);
    setLastSyncedAt(Date.now());
    refreshSyncStatus();
    return true;
  }catch(e){
    console.error('blobSave failed:', e);
    queueSave(name, data);
    refreshSyncStatus();
    toast('Saved locally — waiting to sync when you are back online');
    return true;
  }
}

async function blobLoad(name){
  if(isScheduleDeletedLocally(name)) return null;
  const all=getLocalSchedules();
  const queued=getSyncQueue().find(item=>item.name===name && item.type==='save');
  if(!navigator.onLine){
    return queued?.data || all[name] || null;
  }
  try{
    const data=await remoteLoad(name);
    if(data){
      setKnownRemoteSavedAt(name, data.savedAt||0);
      if(queued && (queued.localSavedAt||0) >= (data.savedAt||0)) return queued.data || all[name] || data;
      cacheSchedule(name, data);
      return data;
    }
  }catch(e){}
  return queued?.data || all[name] || null;
}

async function blobList(){
  const deleted=getDeleteTombstones();
  const localKeys=Object.keys(getLocalSchedules()).filter(name=>!deleted[name]);
  if(!navigator.onLine){
    return localKeys;
  }
  let remoteKeys=[];
  try{
    remoteKeys=await remoteList();
  }catch(e){}
  return Array.from(new Set([...(remoteKeys||[]), ...localKeys])).filter(name=>!deleted[name]);
}

async function cleanupStaleLocalCache(auto=false){
  getDeleteTombstones();
  if(!navigator.onLine){
    if(!auto) toast('Go online to compare local cache with Netlify');
    return 0;
  }
  let remoteKeys=[];
  try{ remoteKeys=await remoteList(); }catch(e){ if(!auto) toast('Could not read remote schedule list'); return 0; }
  const remoteSet=new Set(remoteKeys);
  const queuedNames=new Set(getSyncQueue().map(i=>i.name));
  const local=getLocalSchedules();
  let removed=0;
  Object.keys(local).forEach(name=>{
    if(name===curName) return;
    if(queuedNames.has(name)) return;
    if(!remoteSet.has(name)){
      delete local[name];
      removeKnownRemoteSavedAt(name);
      removed++;
    }
  });
  saveLocalSchedules(local);
  refreshSyncStatus();
  if(!auto) toast(removed?`Removed ${removed} stale local cache entr${removed===1?'y':'ies'}`:'No stale local cache found');
  return removed;
}

async function flushSyncQueue(showToastMsg=false){
  const q=getSyncQueue();
  if(!navigator.onLine || !q.length){refreshSyncStatus(); return true;}
  setSyncStatus('syncing','Syncing…');
  const latestMap=new Map();
  q.forEach(item=>latestMap.set(item.name, item));
  const ops=[...latestMap.values()].sort((a,b)=>(a.queuedAt||0)-(b.queuedAt||0));
  const failed=[];
  let syncedCount=0, conflictCount=0;
  for(const item of ops){
    try{
      if(item.type==='delete'){
        const remote=await remoteLoad(item.name).catch(()=>null);
        const remoteSavedAt=remote?.savedAt||0;
        if(remoteSavedAt && item.knownRemoteSavedAt && remoteSavedAt>item.knownRemoteSavedAt){
          failed.push({...item, conflict:true, conflictAt:Date.now(), remoteSavedAt, reason:'remote-newer'});
          conflictCount++;
          continue;
        }
        await remoteSave(item.name, null, true);
        removeKnownRemoteSavedAt(item.name);
        syncedCount++;
      }else{
        const remote=await remoteLoad(item.name).catch(()=>null);
        const remoteSavedAt=remote?.savedAt||0;
        const known=item.knownRemoteSavedAt||0;
        const localSavedAt=item.localSavedAt||item.data?.savedAt||0;
        if(remote && remoteSavedAt>known && remoteSavedAt>localSavedAt){
          failed.push({...item, conflict:true, conflictAt:Date.now(), remoteSavedAt, reason:'remote-newer'});
          conflictCount++;
          continue;
        }
        await remoteSave(item.name, item.data, false);
        cacheSchedule(item.name, item.data);
        setKnownRemoteSavedAt(item.name, localSavedAt||Date.now());
        syncedCount++;
      }
    }catch(e){
      console.error('Sync failed for', item.name, e);
      failed.push({...item, conflict:false});
      if(!navigator.onLine) break;
    }
  }
  saveSyncQueue(failed);
  if(syncedCount) setLastSyncedAt(Date.now());
  syncState='idle';
  refreshSyncStatus();
  if(!failed.length) await cleanupStaleLocalCache(true);
  if(showToastMsg){
    const msg = [
      syncedCount?`${syncedCount} synced`:null,
      failed.filter(i=>!i.conflict).length?`${failed.filter(i=>!i.conflict).length} pending`:null,
      conflictCount?`${conflictCount} conflict${conflictCount===1?'':'s'}`:null
    ].filter(Boolean).join(' · ') || 'Nothing to sync';
    toast(msg + (conflictCount?' — remote newer, local kept as snapshot':'')); 
  }
  return failed.length===0;
}

function triggerImportJson(){
  document.getElementById('import-json-inp').click();
}

function downloadJson(filename, payload){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),300);
}

function exportCurrentJson(){
  const payload={
    type:'roseland-schedule',
    version:1,
    name:curName||'Unsaved schedule',
    exportedAt:Date.now(),
    snapshots:getSnapshotCount(curName||''),
    schedule:{meta:getMeta(), rows:JSON.parse(JSON.stringify(rows))}
  };
  const safe=(curName||'schedule').replace(/[^\w\-]+/g,'_');
  downloadJson(`${safe}.json`, payload);
  toast('Current schedule exported ✓');
}

async function exportLibraryJson(){
  const keys=await blobList();
  const schedules={};
  for(const key of keys){
    const s=await blobLoad(key);
    if(s) schedules[key]=s;
  }
  const payload={
    type:'roseland-schedule-library',
    version:1,
    exportedAt:Date.now(),
    schedules,
    templates:getAllTpl(),
    snapshots:readJSON(LS_SNAP_KEY,{})
  };
  downloadJson(`roseland-schedule-library-${new Date().toISOString().slice(0,10)}.json`, payload);
  toast('Library exported ✓');
}

async function handleImportJson(input){
  const file=input.files&&input.files[0];
  if(!file) return;
  try{
    const text=await file.text();
    const data=JSON.parse(text);
    let importedSchedules=0;
    if(data.type==='roseland-schedule-library'){
      const scheds=data.schedules||{};
      Object.entries(scheds).forEach(([name,s])=>{
        cacheSchedule(name,s); saveSnapshot(name,s,'Imported snapshot'); queueSave(name,s); importedSchedules++;
      });
      const tpls=data.templates||{};
      if(Object.keys(tpls).length){
        const allTpl=getAllTpl();
        saveAllTpl({...allTpl, ...tpls});
      }
      const snaps=data.snapshots||{};
      if(Object.keys(snaps).length){
        const cur=readJSON(LS_SNAP_KEY,{});
        writeJSON(LS_SNAP_KEY,{...cur, ...snaps});
      }
      await flushSyncQueue(false);
      renderSchedList(); renderTplList(); renderVersionList(versionTargetName||curName||'');
      toast(`Imported library — ${importedSchedules} schedules`);
    }else{
      const imported=data.type==='roseland-schedule' ? data.schedule : data;
      const fallbackName=(data.name||file.name.replace(/\.json$/i,'')||'Imported schedule').trim();
      let name=prompt('Import as schedule name:', fallbackName);
      if(!name){input.value=''; return;}
      name=name.trim();
      cacheSchedule(name, imported);
      saveSnapshot(name, imported, 'Imported snapshot');
      queueSave(name, imported);
      await flushSyncQueue(false);
      clearAll();
      rows=(imported.rows||[]).map(r=>({...makeRow(),...r}));
      setMeta(imported.meta||{});
      curName=name; isDirty=false;
      document.getElementById('sched-label').textContent=name;
      render();
      toast(`Imported: ${name}`);
    }
  }catch(e){
    console.error('Import failed', e);
    toast('Import failed — invalid JSON');
  }
  input.value='';
}

function syncNow(){flushSyncQueue(true);}
function retryPendingSync(){flushSyncQueue(true);}
window.addEventListener('online', () => {
  refreshSyncStatus();
  setTimeout(() => {
    if(navigator.onLine) flushSyncQueue(false);
  }, 3000);
});
window.addEventListener('offline', refreshSyncStatus);
function getMeta(){
  return{
    town:document.getElementById('m-town').value,
    date:document.getElementById('m-date').value,
    prod:document.getElementById('m-prod').value,
    dir:document.getElementById('m-dir').value,
    dp:document.getElementById('m-dp').value,
    lat:selLat,lng:selLng,wx:wxData||null
  };
}
function setMeta(m){
  document.getElementById('m-town').value=m.town||'';
  const de=document.getElementById('m-date'); de.value=m.date||''; de.style.color=m.date?'':'transparent';
  document.getElementById('m-prod').value=m.prod||'';
  document.getElementById('m-dir').value=m.dir||'';
  document.getElementById('m-dp').value=m.dp||'';
  selLat=m.lat||null; selLng=m.lng||null; selDisp=m.town||'';
  document.getElementById('town-map-btn').style.display=(m.lat||m.town)?'inline-block':'none';
  if(m.wx){wxData=m.wx;renderWx(m.wx);if(m.wx.sunrise&&m.wx.sunset)insertSunRows(m.wx.sunrise,m.wx.sunset);}
  else{wxData=null;document.getElementById('wx-strip').classList.remove('show');}
}
function clearAll(){
  initRows(15);
  ['m-town','m-date','m-prod','m-dir','m-dp'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('m-date').style.color='transparent';
  document.getElementById('call-disp').textContent='\u2014';
  document.getElementById('wx-strip').classList.remove('show');
  document.getElementById('town-map-btn').style.display='none';
  document.getElementById('url-chip').style.display='none';
  document.getElementById('view-chip').style.display='none';
  document.getElementById('sched-label').textContent='Unsaved schedule';
  selLat=null; selLng=null; selDisp=''; wxData=null; curName=null; isDirty=false;
}

/* ─────────────────────────────────────────────
   SAVE / LOAD
───────────────────────────────────────────── */
function newSchedule(){
  recordUndoStep();
  if(isDirty&&!confirm('Start a new schedule? Unsaved changes will be lost.')) return;
  clearAll(); render();
}
function quickSave(){if(!curName){openSaveAs();return;}doSave(curName);}

async function doSave(name){
  saveCrewName('prod',document.getElementById('m-prod').value);
  saveCrewName('dir',document.getElementById('m-dir').value);
  saveCrewName('dp',document.getElementById('m-dp').value);
  const data={meta:getMeta(),rows:JSON.parse(JSON.stringify(rows)),savedAt:Date.now()};
  const ok=await blobSave(name,data);
  if(!ok){toast('Save did not finish — check your connection and try again');return;}
  curName=name; isDirty=false;
  document.getElementById('sched-label').textContent=name;
  const slug=encodeURIComponent(name);
  const editUrl=window.location.origin+window.location.pathname+'?s='+slug;
  const viewUrl=window.location.origin+window.location.pathname+'?v='+slug;
  const chip=document.getElementById('url-chip');
  chip.textContent='\uD83D\uDD17 Copy Link';
  chip.style.display='';
  chip.dataset.url=editUrl;
  chip.dataset.viewname=name;
  const vchip=document.getElementById('view-chip');
  vchip.style.display='';
  toast('Saved to My Library: '+name);
}

function openSaveAs(){
  const inp=document.getElementById('saveas-inp');
  const town=document.getElementById('m-town').value.trim();
  const date=document.getElementById('m-date').value;
  if(!inp.value&&town){
    const d=date?new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    inp.value=town.split(',')[0].trim()+(d?' \u2013 '+d:'');
  }
  openOv('ov-saveas');
  setTimeout(()=>document.getElementById('saveas-inp').focus(),80);
}
function confirmSaveAs(){
  const name=document.getElementById('saveas-inp').value.trim();
  if(!name){toast('Enter a schedule name to save a copy');return;}
  doSave(name);
  document.getElementById('saveas-inp').value='';
  closeOv('ov-saveas');
}
function copyUrl(){
  const url=document.getElementById('url-chip').dataset.url||window.location.href;
  navigator.clipboard.writeText(url).then(()=>toast('Team Link copied \u2713')).catch(()=>prompt('Copy URL:',url));
}
async function copyViewUrl(){
  const chip=document.getElementById('url-chip');
  const name=chip?.dataset?.viewname||curName;
  if(!name){prompt('Copy URL:',window.location.href);return;}
  await copyClientVendorLinkExact(name);
}
async function checkUrlParam(){
  const params=new URLSearchParams(window.location.search);
  const sName=params.get('s'); // edit mode
  const vName=params.get('v'); // view mode
  const name=sName||vName;
  if(!name) return false;
  const dec=decodeURIComponent(name);
  const s=await blobLoad(dec);
  if(!s) return false;
  clearAll(); rows=s.rows.map(r=>({...makeRow(),...r}));
  setMeta(s.meta||{}); curName=dec; isDirty=false;
  document.getElementById('sched-label').textContent=dec;
  if(vName){
    // READ-ONLY mode
    document.body.classList.add('readonly');
  }
  render(); return true;
}

/* ─────────────────────────────────────────────
   LIBRARY
───────────────────────────────────────────── */
async function openLibrary(){if(!(await ensureEditorAccess())) return; await renderSchedList(); renderTplList(); openOv('ov-library');}
function switchTab(tab){
  ['schedules','templates','backup','versions'].forEach(t=>{
    document.getElementById('tab-btn-'+t).classList.toggle('active',t===tab);
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='versions') renderVersionPicker(versionTargetName || curName || '');
}
async function renderSchedList(){
  const list=document.getElementById('sched-list');
  list.innerHTML='<div class="empty">Loading\u2026</div>';
  const keys=await blobList();
  if(!keys.length){list.innerHTML='<div class="empty"><strong>No schedules yet.</strong><br>Create a new schedule, then save it to keep it here.</div>';return;}
  list.innerHTML='';
  // Load metadata for each schedule
  const schedData=(await Promise.all(keys.map(k=>blobLoad(k).then(d=>({key:k,data:d}))))).filter(x=>x.data);
  schedData.sort((a,b)=>(b.data?.savedAt||0)-(a.data?.savedAt||0));
  schedData.forEach(({key:k,data:s})=>{
    const slug=encodeURIComponent(k);
    const editUrl=window.location.origin+window.location.pathname+'?s='+slug;
    const viewUrl=window.location.origin+window.location.pathname+'?v='+slug;
    const d=s?.meta?.date?new Date(s.meta.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
    const town=s?.meta?.town?(s.meta.town.split(',')[0].trim()):'';
    const acts=(s?.rows||[]).filter(r=>r.action&&!r.sunLocked).length;
    const it=document.createElement('div'); it.className='sitem';
    it.innerHTML=`<div class="sitem-info"><div class="sitem-name">${k}</div><div class="sitem-meta">${town}${d?' \u00B7 '+d:''} \u00B7 ${acts} actions</div></div><div class="sitem-acts"><button class="sitem-copy" title="Copy edit link" onclick="event.stopPropagation();copyTeamLinkExact('${k.replace(/'/g,"\\'")}')">Team Link</button><button class="sitem-copy" title="Copy read-only link" onclick="event.stopPropagation();copyClientVendorLinkExact('${k.replace(/'/g,"\\'")}')">Client / Vendor Link</button><button class="sitem-del" onclick="event.stopPropagation();deleteSched('${k.replace(/'/g,"\\'")}')">&#128465;</button></div>`;
    it.addEventListener('click',()=>loadSched(k));
    list.appendChild(it);
  });
}
function renderTplList(){
  const all=getAllTpl();const list=document.getElementById('tpl-list');list.innerHTML='';
  const keys=Object.keys(all).sort((a,b)=>(all[b].savedAt||0)-(all[a].savedAt||0));
  if(!keys.length){list.innerHTML='<div class="empty"><strong>No templates saved yet.</strong><br>Build a schedule setup, then choose <b>+ Save Current as Template</b> to reuse it later.</div>';return;}
  keys.forEach(k=>{
    const tpl=all[k]; const cnt=(tpl.rows||[]).filter(r=>r.action).length;
    const it=document.createElement('div'); it.className='sitem';
    it.innerHTML=`<div class="sitem-info"><div class="sitem-name">\u2605 ${k}</div><div class="sitem-meta">${cnt} actions</div></div><div class="sitem-acts"><button class="sitem-del" onclick="event.stopPropagation();deleteTpl('${k.replace(/'/g,"\\'")}')">&#128465;</button></div>`;
    it.addEventListener('click',()=>loadTpl(k));
    list.appendChild(it);
  });
}
async function loadSched(name){
  if(isDirty&&!confirm('Load "'+name+'"? Unsaved changes will be lost.')) return;
  const s=await blobLoad(name); if(!s) return;
  clearAll(); rows=s.rows.map(r=>({...makeRow(),...r}));
  setMeta(s.meta||{}); curName=name; isDirty=false;
  document.getElementById('sched-label').textContent=name;
  const slug=encodeURIComponent(name);
  const editUrl=window.location.origin+window.location.pathname+'?s='+slug;
  const viewUrl=window.location.origin+window.location.pathname+'?v='+slug;
  const chip=document.getElementById('url-chip');
  chip.textContent='\uD83D\uDD17 Copy Link'; chip.style.display='';
  chip.dataset.url=editUrl; chip.dataset.viewname=name;
  closeOv('ov-library'); render(); toast('Loaded ✓ ' + name);
  if(notifPerm==='granted') startNotifWatcher();
}
async function deleteSched(name){
  if(!(await ensureEditorAccess())) return;
  if(!confirm('Delete "'+name+'" from My Library? This permanently removes the saved schedule.')) return;
  const deletePassword=prompt('Enter delete password:')||'';
  if(!deletePassword){toast('Delete cancelled — schedule kept');return;}
  try{
    if(!navigator.onLine){toast('Go online to delete a saved schedule');return;}
    await remoteSave(name,null,true,deletePassword);
    markDeletedSchedule(name);
    removeCachedSchedule(name);
    const q=getSyncQueue().filter(item=>item.name!==name);
    saveSyncQueue(q);
    removeKnownRemoteSavedAt(name);
    if(curName===name){
      curName=null;
      document.getElementById('sched-label').textContent='Unsaved schedule';
      initRows(15);
      render();
    }
    setLastSyncedAt(Date.now());
    refreshSyncStatus();
    await cleanupStaleLocalCache(true);
    await renderSchedList();
    toast('Deleted from My Library: ' + name);
  }catch(e){
    const msg=(e&&e.message)||'';
    if(/invalid delete password/i.test(msg)){
      alert('Invalid delete password. The schedule was not removed.');
      toast('Invalid delete password — the schedule was not removed');
    }else{
      toast(msg||'Delete did not complete — the schedule was not removed');
    }
    await renderSchedList();
  }
}
function openSaveTemplate(){closeOv('ov-library');openOv('ov-savetpl');setTimeout(()=>document.getElementById('savetpl-inp').focus(),80);}
function confirmSaveTemplate(){
  const name=document.getElementById('savetpl-inp').value.trim();
  if(!name){toast('Enter a template name so you can reuse this setup later');return;}
  const all=getAllTpl();
  all[name]={rows:JSON.parse(JSON.stringify(rows.filter(r=>!r.sunLocked))),savedAt:Date.now()};
  saveAllTpl(all);
  document.getElementById('savetpl-inp').value='';
  closeOv('ov-savetpl'); toast('Template saved: '+name);
}
function loadTpl(name){
  const tpl=getAllTpl()[name]; if(!tpl) return;
  if(isDirty&&!confirm('Load template "'+name+'"? Unsaved changes will be lost.')) return;
  clearAll(); rows=tpl.rows.map(r=>({...makeRow(),...r,sunLocked:false}));
  document.getElementById('sched-label').textContent='New from: '+name;
  closeOv('ov-library'); render(); toast('Template loaded — update the town, date, and details for this schedule');
}
function deleteTpl(name){
  if(!confirm('Delete template "'+name+'"?')) return;
  const all=getAllTpl(); delete all[name]; saveAllTpl(all); renderTplList();
}
function copyText(t){navigator.clipboard.writeText(t).then(()=>toast('URL copied \u2713')).catch(()=>prompt('Copy URL:',t));}

/* ─────────────────────────────────────────────
   MODALS
───────────────────────────────────────────── */
function openOv(id){document.getElementById(id).classList.add('open');}
function closeOv(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');});
});

/* ─────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────── */
const ND_KEY='rp_notif_dismissed';
const NF_KEY='rp_notif_fired';

function initNotifBanner(){
  if(notifPerm==='granted'){showNotifActive();startNotifWatcher();}
  else if(notifPerm==='denied'){/* blocked, stay silent */}
  else if(!localStorage.getItem(ND_KEY)){document.getElementById('notif-banner').classList.add('show');}
}
async function requestNotif(){
  const result=await Notification.requestPermission();
  notifPerm=result;
  if(result==='granted'){showNotifActive();startNotifWatcher();toast('Alerts enabled \u2713');}
  else{document.getElementById('notif-banner').classList.remove('show');if(result==='denied')toast('Notifications blocked \u2014 enable in browser settings');}
}
function dismissNotif(){
  localStorage.setItem(ND_KEY,'1');
  document.getElementById('notif-banner').classList.remove('show');
}
function showNotifActive(){
  const banner=document.getElementById('notif-banner');
  banner.classList.add('show');
  document.getElementById('notif-btns').innerHTML='<div class="notif-status"><span class="notif-dot"></span>Alerts on &nbsp;<button class="notif-later" onclick="disableNotifs()">Turn off</button></div>';
  setTimeout(()=>banner.classList.remove('show'),4000);
}
function disableNotifs(){
  clearInterval(notifTimer); notifTimer=null;
  localStorage.setItem(ND_KEY,'1');
  document.getElementById('notif-banner').classList.remove('show');
  toast('Alerts turned off');
}
function startNotifWatcher(){
  if(notifTimer) clearInterval(notifTimer);
  notifTimer=setInterval(checkOverdue,30000);
}
function checkOverdue(){
  if(Notification.permission!=='granted') return;
  const dateVal=document.getElementById('m-date').value;
  if(!dateVal) return;
  const now=new Date();
  if(now.toDateString()!==new Date(dateVal+'T00:00:00').toDateString()) return;
  const fKey=NF_KEY+'_'+(curName||'unsaved')+'_'+dateVal;
  const fired=JSON.parse(localStorage.getItem(fKey)||'{}');
  const nowMin=now.getHours()*60+now.getMinutes();
  rows.forEach((row,i)=>{
    if(row.sunLocked||!row.action||row.done) return;
    const toStr=getTimeOut(i); if(!toStr) return;
    const toMin=t12m(toStr); if(toMin===null) return;
    const over=nowMin-(toMin+5);
    if(over<0||over>30) return;
    const key=i+'_'+toStr; if(fired[key]) return;
    fired[key]=true; localStorage.setItem(fKey,JSON.stringify(fired));
    const n=new Notification('\u23F1 '+row.action+' \u2014 Time check',{
      body:'Scheduled to finish at '+toStr+'. Tap to mark complete.',
      tag:'rp_'+i,requireInteraction:false
    });
    n.onclick=()=>{window.focus();if(rows[i]&&!rows[i].done){rows[i].done=true;render();markDirty();toast('\u2713 '+row.action+' marked complete');}n.close();};
    setTimeout(()=>n.close(),20000);
  });
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
let toastTimer;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ─────────────────────────────────────────────
   SCROLL HINT
───────────────────────────────────────────── */
window.addEventListener('resize',()=>{
  const h=document.getElementById('scroll-hint');
  if(h) h.style.display=window.innerWidth<=600?'flex':'none';
});

/* ─────────────────────────────────────────────
   OUTSIDE CLICK — close all dropdowns
───────────────────────────────────────────── */
document.addEventListener('click',e=>{
  if(!e.target.closest('.ac-wrap')&&!e.target.closest('.loc-wrap')){
    document.querySelectorAll('.ac-dropdown.open,.loc-ac.open').forEach(d=>{
      d.classList.remove('open'); d.innerHTML='';
    });
  }
});

/* ─────────────────────────────────────────────
   CMS  —  server-backed, PIN-protected
───────────────────────────────────────────── */

/* ── Color style options for action rows ── */
const CMS_COLOR_OPTS=[
  {val:'',        label:'— none —'},
  {val:'aShoot',  label:'Shoot (pink)'},
  {val:'aLunch',  label:'Lunch (yellow)'},
  {val:'aDinner', label:'Dinner (rose)'},
  {val:'aWrap',   label:'Wrap (green)'},
  {val:'aDayOff', label:'Day Off (mint)'},
  {val:'aDrive',  label:'Drive (blue)'},
  {val:'aMove',   label:'Move (purple)'},
  {val:'aCrewCall',label:'Crew Call (orange)'},
  {val:'aBreakfast',label:'Breakfast (cream)'},
  {val:'aBreak',  label:'Break (sage)'},
  {val:'aSetup',  label:'Set Up (lavender)'},
  {val:'aOther',  label:'Other (slate)'},
];

/* ── Editable label definitions ── */
const CMS_LABELS=[
  {key:'appTitle',    label:'Page title',           def:'Production Schedule'},
  {key:'hdrTitle',    label:'Header subtitle',       def:'Production Schedule'},
  {key:'colAction',   label:'Column: Action',        def:'Action'},
  {key:'colDesc',     label:'Column: Description',   def:'Description'},
  {key:'colLocation', label:'Column: Location',      def:'Location'},
  {key:'colNotes',    label:'Column: Notes',         def:'Notes'},
  {key:'colTimeIn',   label:'Column: Time In',       def:'Time In'},
  {key:'colDuration', label:'Column: Duration',      def:'Duration'},
  {key:'colTimeOut',  label:'Column: Time Out',      def:'Time Out'},
  {key:'colDone',     label:'Column: Done',          def:'Done'},
  {key:'metaTown',    label:'Meta: Town / Location', def:'Town / Location'},
  {key:'metaDate',    label:'Meta: Date',            def:'Date'},
  {key:'metaCall',    label:'Meta: Call Time',       def:'Call Time'},
  {key:'metaProd',    label:'Meta: Producer(s)',     def:'Producer(s)'},
  {key:'metaDir',     label:'Meta: Director',        def:'Director'},
  {key:'metaDp',      label:'Meta: Cinematographer', def:'Cinematographer'},
  {key:'btnAddRow',   label:'Button: Add Row',       def:'+ Add Row'},
];

/* ── Brand colour definitions ── */
const CMS_COLORS=[
  {key:'--pink',       label:'Primary accent',       def:'#e91e8c'},
  {key:'--pink-dark',  label:'Primary dark',         def:'#9d1468'},
  {key:'--pink-light', label:'Primary light',        def:'#f472b6'},
  {key:'--black',      label:'Header background',    def:'#111111'},
  {key:'--row-even',   label:'Alternate row fill',   def:'#fdf4f9'},
  {key:'--row-hover',  label:'Row hover fill',       def:'#fce7f3'},
  {key:'--g100',       label:'App background',       def:'#f4f4f5'},
];

/* ── Action row color style definitions ── */
const CMS_ACTION_STYLES=[
  {cls:'aShoot',    label:'Shoot',          defBg:'#fce7f3',defText:'#9d1468'},
  {cls:'aLunch',    label:'Lunch',          defBg:'#fef9c3',defText:'#854d0e'},
  {cls:'aDinner',   label:'Dinner',         defBg:'#fff1f2',defText:'#9f1239'},
  {cls:'aWrap',     label:'Wrap',           defBg:'#dcfce7',defText:'#166534'},
  {cls:'aDayOff',   label:'Day Off',        defBg:'#f0fdf4',defText:'#15803d'},
  {cls:'aDrive',    label:'Drive',          defBg:'#eff6ff',defText:'#1d4ed8'},
  {cls:'aMove',     label:'Move',           defBg:'#f5f3ff',defText:'#6d28d9'},
  {cls:'aCrewCall', label:'Crew Call',      defBg:'#fff7ed',defText:'#c2410c'},
  {cls:'aBreakfast',label:'Breakfast',      defBg:'#fefce8',defText:'#a16207'},
  {cls:'aBreak',    label:'Break',          defBg:'#f0fdf4',defText:'#166534'},
  {cls:'aSetup',    label:'Set Up',         defBg:'#faf5ff',defText:'#7e22ce'},
  {cls:'aOther',    label:'Other',          defBg:'#f1f5f9',defText:'#475569'},
];

/* ── Working state ── */
let cmsPin='';
let cmsAuthenticated=false;
let cmsActions=null;
let cmsLabels=null;
let cmsColors=null;
let cmsActionStyles=null;
let cmsLogoData=null;
let cmsLogoChanged=false;
let cmsAcDragSrc=null;
let cmsServerConfig={};  // last loaded from server
