/* Link helpers extracted from index.html.
   Keep this file focused on Team Link / Client-Vendor link generation
   and the copy modal flow. */
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

function copyLinkFromModal(){
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

function copyClientVendorLinkExact(name){
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
