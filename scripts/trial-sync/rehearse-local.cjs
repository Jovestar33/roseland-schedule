#!/usr/bin/env node
// Explicitly bounded local integration: genuine Supabase Auth/RPCs; in-memory
// Netlify store with conditional writes. Never a hosted parity claim.
const fs=require('node:fs/promises'),{createHmac,randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js'),{supabaseAdapter,netlifyAdapter}=require('./adapters.cjs'),{apply,hash}=require('./core.cjs'),{openJournal}=require('./journal.cjs'),{report,html}=require('./report.cjs');
function totp(secret){let bits='';for(const x of secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(x).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2))),b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(b).digest(),o=h.at(-1)&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
(async()=>{
 const settings=JSON.parse(await fs.readFile('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8')),f=JSON.parse(await fs.readFile('/private/tmp/roseland-catchup-admin.json','utf8'));
 if(settings.API_URL!=='http://127.0.0.1:56521'||f.email!=='catchup-admin-20261020@example.test'||!f.factor)throw Error('Only existing fictional local fixture is allowed');
 const client=createClient(settings.API_URL,settings.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 let r=await client.auth.signInWithPassword({email:f.email,password:f.password});if(r.error)throw Error('Local login failed');
 r=await client.auth.mfa.challengeAndVerify({factorId:f.factor.id,code:totp(f.factor.secret)});if(r.error)throw Error('Local MFA failed');
 const {data:{session}}=await client.auth.getSession();
 const rpc=async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Error(name+' failed: '+r.error.code);return r.data;};
 const seed=await rpc('session_read_schedule',{target_schedule_id:'aa210b74-57b6-4c16-8848-9cd342929953'});
 if(seed.organization_id!=='0f5c1fb6-71ee-46e0-b378-48117008bd93')throw Error('Fixture organization mismatch');
 const id=randomUUID(),m={id:randomUUID(),netlifyKey:'Sync rehearsal — fictional',supabaseId:id};
 const created=await rpc('create_schedule_in_production',{target_schedule_id:id,target_production_id:seed.production_id,target_day_id:null,target_phase_id:null,next_display_name:'Sync rehearsal — fictional '+id.slice(0,8),next_slug:'sync-rehearsal-'+id,next_document:seed.document,schema_version:1});
 const root='/private/tmp/roseland-trial-sync-'+id;await fs.mkdir(root,{mode:0o700});
 console.log('Local rehearsal checkpoint: '+root);
 await fs.writeFile(root+'/fixture.json',JSON.stringify({scheduleId:id,organizationId:seed.organization_id,createdAt:new Date().toISOString()}),{mode:0o600});
 let legacy={data:structuredClone(created.document),etag:'1',metadata:{fixture:true}},version=1;
 const store={getWithMetadata:async()=>structuredClone(legacy),set:async(key,payload,options)=>{if(options.onlyIfMatch!==legacy.etag)return{modified:false};legacy={data:JSON.parse(payload),etag:String(++version),metadata:options.metadata};return{modified:true,etag:legacy.etag};}};
 const adapters={netlify:netlifyAdapter({store,library:{get:async()=>({folders:[],scheduleFolderMap:{}})}}),supabase:supabaseAdapter({url:settings.API_URL,apiKey:settings.ANON_KEY,accessToken:session.access_token,actorId:session.user.id,organizationId:seed.organization_id})};
 await adapters.supabase.verify();const config={organizationId:seed.organization_id,mappings:[m]};const journal=await openJournal(root+'/journal',config);let checks=[];
 const run=async(options)=>apply(journal.state,m,adapters,journal.checkpoint,options);
 try{
  assert.equal((await run()).status,'synced');checks.push('Equal imported copies establish a baseline');
  legacy.data.rows[0].desc='Netlify-side fictional edit\nSecond line and contact details retained';legacy.etag=String(++version);
  assert.equal((await run()).status,'synced');assert.equal((await adapters.supabase.read(m)).document.rows[0].desc,legacy.data.rows[0].desc);checks.push('Netlify-side edit written via genuine Supabase versioned RPC');
  const remote=await adapters.supabase.read(m);remote.document.rows[1].notes='New-app fictional edit';await adapters.supabase.write(m,remote,remote.document);
  assert.equal((await run()).status,'synced');assert.equal(legacy.data.rows[1].notes,'New-app fictional edit');checks.push('Genuine Supabase edit copied to the conditional Netlify adapter');
  legacy.data.rows[0].desc='Netlify competing edit';legacy.etag=String(++version);const target=await adapters.supabase.read(m);target.document.rows[0].desc='New-app competing edit';await adapters.supabase.write(m,target,target.document);
  assert.equal((await run()).status,'content-conflict');checks.push('Real two-sided divergence retains both versions and stops writes');
  const conflict=report(journal.state,config,{netlifyUnmapped:[],supabaseUnmapped:[]});await fs.writeFile(root+'/conflict-review.html',html(conflict),{mode:0o600});
  const reviewHash=hash(journal.state.entries[m.id].observed);assert.equal((await run({resolution:{take:'supabase',reviewHash}})).status,'synced');assert.equal(legacy.data.rows[0].desc,'New-app competing edit');checks.push('Exact reviewed resolution converges while checkpoints retain both originals');
  const before=await adapters.supabase.read(m),change=structuredClone(before.document);change.rows[0].notes='Concurrent local change';await adapters.supabase.write(m,before,change);
  await assert.rejects(adapters.supabase.write(m,before,before.document),e=>e.code==='CONFLICT');checks.push('Real database rejects stale expected_version');
  const result={localOnly:true,netlify:'In-memory conditional store through production sync adapter',supabase:'Genuine existing fictional Auth + MFA and current session RPCs',scheduleId:id,checks};await fs.writeFile(root+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({root,scheduleId:id,checks},null,2));
 }finally{await journal.release();await client.auth.signOut({scope:'local'});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
