// Read-only verification using existing genuine fictional sessions. No grants.
const fs=require('node:fs'),crypto=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
(async()=>{
 const config=JSON.parse(fs.readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json'));
 const fixture=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-document-cases.json'));
 const review=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json'));
 const old=JSON.parse(fs.readFileSync('/private/tmp/roseland-b14-fixtures.json'));
 if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Loopback fixture required');
 const result={};
 for(const [label,access] of [['review',review],['restrictedViewer',old.viewer]]){
  const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url??input.href);if(u.origin!==config.API_URL)throw Error('Nonlocal request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}});
  const login=await c.auth.signInWithPassword({email:access.email,password:access.password});
  if(login.error)throw Error(label+' existing login unavailable');
  const out={actor:login.data.user.id,capabilities:{}};
  for(const id of [fixture.restrictedSource,fixture.target]){
   out.capabilities[id]={};
   for(const action of ['read','edit','export']){
    const r=await c.rpc('schedule_capability',{action,target_production_id:fixture.production,target_schedule_id:id});
    out.capabilities[id][action]=r.error?{error:r.error.code}:r.data;
   }
  }
  if(label==='review'){
   const doc=await c.rpc('session_read_schedule',{target_schedule_id:fixture.target});if(doc.error)throw Error('Target read unavailable');
   const snapshots=await c.rpc('list_schedule_snapshots',{target_schedule_id:fixture.target});if(snapshots.error)throw Error('Snapshot read unavailable');
   const template=await c.rpc('read_schedule_template',{target_template_id:old.template});if(template.error)throw Error('Existing template unavailable');
   out.target=doc.data;out.snapshots=snapshots.data;out.template=template.data;
   out.targetHash=crypto.createHash('sha256').update(JSON.stringify(doc.data.document)).digest('hex');
  }
  result[label]=out;await c.auth.signOut({scope:'local'});
 }
 const file=process.argv[2];if(!file?.startsWith('evidence/b15-document/'))throw Error('Evidence path required');
 fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({targetVersion:result.review.target.document_version,snapshotCount:result.review.snapshots.length,viewer:result.restrictedViewer.capabilities}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
