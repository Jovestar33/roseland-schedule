// Authenticated, read-only verification of the disposable runtime fixtures.
const fs=require('node:fs'),crypto=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
(async()=>{
 const config=JSON.parse(fs.readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json'));
 const access=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-overnight-fixtures.json')).member;
 const fixture=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-runtime-cases.json'));
 if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Loopback fixture required');
 const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url??input.href);if(u.origin!==config.API_URL)throw Error('Nonlocal request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}});
 if((await c.auth.signInWithPassword({email:access.email,password:access.password})).error)throw Error('Fixture sign-in failed');
 const result=[];
 for(const f of fixture.rows.filter(r=>r.kind!=='library')){
  const r=await c.rpc('session_read_schedule',{target_schedule_id:f.id});if(r.error||!r.data)throw Error('Readback failed');
  const d=r.data;result.push({kind:f.kind,id:f.id,version:d.document_version,hash:crypto.createHash('sha256').update(JSON.stringify(d.document)).digest('hex'),document:d.document});
 }
 const file=process.argv[2];if(!file||!file.startsWith('evidence/b15-runtime/'))throw Error('Evidence path required');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.map(({kind,version,document})=>({kind,version,notes:document.rows?.[0]?.notes}))));
 await c.auth.signOut({scope:'local'});
})().catch(()=>{console.error('Disposable-fixture readback failed');process.exitCode=1;});
