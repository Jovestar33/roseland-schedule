import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const path='/Users/johnsammon/Downloads/All-authorized-schedules-2026-09-19.json';
const file=JSON.parse(readFileSync(path,'utf8'));
const config=JSON.parse(readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8'));
const access=JSON.parse(readFileSync('/private/tmp/roseland-b15-review-access.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Fictional loopback required');
const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
if((await client.auth.signInWithPassword({email:access.email,password:access.password})).error)throw Error('Login failed');
assert.equal(file.schedules.length,15);
for(const entry of file.schedules){assert.equal(entry.source.organization,'2f75e684-eb3a-4951-9389-2df147812a8a');const r=await client.rpc('session_read_schedule',{target_schedule_id:entry.source.id});if(r.error)throw Error('Fictional read failed');assert.equal(r.data.display_name,entry.name);assert.equal(r.data.document_version,entry.source.version);assert.deepEqual(entry.data,r.data.document);}
const summary={file:'All-authorized-schedules-2026-09-19.json',records:file.schedules.length,allDocumentsEqualOrdinaryReadback:true,exclusions:file.excludes,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};
copyFileSync(path,'evidence/b15-workflow-completion/library-downloaded.json');writeFileSync('evidence/b15-workflow-completion/library-download-check.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
