import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {documentFixture} from '../tests/fixtures/document-fixtures.ts';
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const args = process.argv.slice(2);
const workdir = args[args.indexOf('--workdir') + 1];
ensure(args.includes('--workdir') && workdir, 'Specify a disposable local --workdir');
ensure(!existsSync(resolve(workdir, 'supabase/.temp/project-ref')), 'Linked projects are not disposable runtime targets');
const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8');
const project = config.match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
ensure(project, 'Local project ID is required');
const container = `supabase_db_${project}`;
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
ensure(info.Name === `/${container}` && info.Config.Image.includes('supabase/postgres'), 'Expected local Supabase container');
function localStatus() {
  try {
    return JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'), ['status', '--workdir', resolve(workdir), '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { throw new Error('Local runtime status unavailable'); } // Never print key-bearing CLI output.
}
const status = localStatus();
const base = new URL(status.API_URL);
const configuredPort = config.match(/\[api\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
ensure(base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname)
  && base.port === configuredPort && !base.username && !base.password, 'Only the configured loopback API is permitted');
const key = status.ANON_KEY;
ensure(typeof key === 'string' && key.length > 0, 'Local anonymous API key unavailable');

const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  ensure(url.origin === base.origin, 'Non-local request refused');
  const started=Date.now();
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000) });
  if(args.includes('--diagnose-login'))console.log(JSON.stringify({path:url.pathname,status:response.status,elapsedMs:Date.now()-started}));
  return response;
};
const clients: SupabaseClient[] = [];
function client() {
  const value = createClient(base.origin, key, { global: { fetch: guardedFetch }, auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
  } });
  clients.push(value);
  return value;
}
function sql(statement: string): string {
  // Admin SQL sets up fictional actors/data only. Exercised schedule calls use
  // genuine password sessions and the existing session admission/RLS contract.
  try {
    return execFileSync('docker', ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
      input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 60000,
    }).trim();
  } catch { throw new Error('Local fixture SQL failed'); }
}
async function identity(label: string) {
  const c = client();
  const email = `auth-${label}-${randomUUID()}@example.test`;
  const password = `Local-${randomBytes(24).toString('hex')}-9aA`;
  const signup = await c.auth.signUp({ email, password });
  ensure(!signup.error && signup.data.user, 'Local synthetic signup failed: '+(signup.error?.code??signup.error?.name??'missing user')+' status '+(signup.error?.status??'none'));
  const id = signup.data.user.id;
  ensure(/^[0-9a-f-]{36}$/.test(id), 'Unexpected synthetic user ID');
  await c.auth.signOut();
  const login = await c.auth.signInWithPassword({ email, password });
  ensure(!login.error && login.data.session && login.data.user.id === id, 'Password login failed');
  const verified = await c.auth.getUser();
  ensure(!verified.error && verified.data.user.id === id, 'Auth could not verify the login-issued session: '+JSON.stringify({code:verified.error?.code??null,status:verified.error?.status??null,name:verified.error?.name??null,userMatches:verified.data.user?.id===id}));
  console.log('Fixture verified: '+label);
  return { c, id, email, password };
}

ensure(['roseland-b05-20260917','roseland-b05-finish-20260917'].includes(project),'Only the isolated B05 stacks are allowed');
if(args.includes('--diagnose-login')){try{const fixture=await identity('b05-diagnostic');console.log('PASS ordinary fictional signup, password login and getUser identity verification');writeFileSync('/private/tmp/b05-diagnostic-fixture.json',JSON.stringify({project,id:fixture.id,email:fixture.email,password:fixture.password}),{mode:0o600});}finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'}).catch(()=>undefined)));}process.exit(0);}
let passed=0;const check=(v:unknown,label:string)=>{ensure(v,label);passed++;console.log('PASS '+label);};
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>){let r=await c.rpc(name,args);if(r.error?.code===''&&/timeout/i.test(r.error.message))r=await c.rpc(name,args);ensure(!r.error,name+': '+JSON.stringify(r.error));return r.data;}
async function denied(c:SupabaseClient,name:string,args:Record<string,unknown>,label:string){const r=await c.rpc(name,args);check(!!r.error&&['PT400','PT404','PT409','42501'].includes(r.error.code),label+' (explicit server denial)');}
try{
 const owner=await identity('snapshot-owner'),admin=await identity('snapshot-admin'),organizer=await identity('snapshot-organizer'),editor=await identity('snapshot-editor'),viewer=await identity('snapshot-viewer'),outsider=await identity('snapshot-outsider');
 const org=randomUUID(),foreign=randomUUID(),prod=randomUUID(),dest=randomUUID(),source=randomUUID();
 sql(`insert into public.organizations(id,name,slug) values('${org}','Fictional Snapshot Studio','snap-${org}'),('${foreign}','Fictional Foreign Studio','snap-${foreign}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${org}','${organizer.id}','member','active',now()),('${org}','${editor.id}','member','active',now()),('${org}','${viewer.id}','member','active',now()),('${foreign}','${outsider.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional Snapshot Production','snap-${prod}'),('${dest}','${org}','Fictional Copy Destination','snap-${dest}');
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${organizer.id}','organizer','active',now()),('${org}','${dest}','${organizer.id}','organizer','active',now()),('${org}','${prod}','${editor.id}','editor','active',now()),('${org}','${prod}','${viewer.id}','viewer','active',now());`);
 const saved=documentFixture(),draft=documentFixture(4);
 const sourceArgs={target_schedule_id:source};
 await ok(owner.c,'create_schedule_in_production',{...sourceArgs,target_production_id:prod,target_day_id:null,target_phase_id:null,next_display_name:'Fictional snapshot source',next_slug:'source-'+source,next_document:saved,schema_version:1});
 const baseAttempt={request_id:randomUUID(),target_snapshot_id:randomUUID(),target_schedule_id:source,expected_version:0,operation:'capture',next_name:'Reviewed draft',next_document:draft,source_version:1,automatic:false,template_uses:[],confirmed_purge:false};
 const mutation=(id:string,version:number,operation:string,extra:Record<string,unknown>={})=>({request_id:randomUUID(),target_snapshot_id:id,target_schedule_id:source,expected_version:version,operation,...extra});
 const read=(c:SupabaseClient,id:string)=>ok(c,'read_schedule_snapshot',{target_snapshot_id:id});
 for(const [a,label] of [[viewer,'Viewer'],[outsider,'Foreign owner']] as const)await denied(a.c,'mutate_schedule_snapshot',baseAttempt,label+' cannot capture');
 const receipt=await ok(editor.c,'mutate_schedule_snapshot',baseAttempt);check(receipt.confirmed&&receipt.version===1,'Editor captures unsaved full draft');
 check(isDeepStrictEqual((await read(viewer.c,baseAttempt.target_snapshot_id)).document,draft),'Viewer reads all snapshot payload fields');
 const unchanged=await ok(owner.c,'read_schedule',sourceArgs);check(unchanged.document_version===1&&isDeepStrictEqual(unchanged.document,saved),'Capture does not save or change source');
 check(sql(`select count(*) from public.schedule_versions where schedule_id='${source}'`)==='1','Capture does not append saved history');
 check(isDeepStrictEqual(await ok(editor.c,'mutate_schedule_snapshot',baseAttempt),receipt),'Lost-ack exact retry returns same receipt');
 await denied(editor.c,'mutate_schedule_snapshot',{...baseAttempt,next_name:'Replacement'},'Request cannot substitute a new payload');
 await denied(owner.c,'mutate_schedule_snapshot',baseAttempt,'Mutation receipt is actor-bound');
 await denied(outsider.c,'read_schedule_snapshot',{target_snapshot_id:baseAttempt.target_snapshot_id},'Foreign owner cannot read snapshot');
 check((await ok(outsider.c,'list_schedule_snapshots',sourceArgs)).length===0,'Foreign list hides snapshot metadata');
 check((await ok(owner.c,'read_snapshot_policy',{target_organization_id:org})).retention_days===null,'No automatic retention by default');
 const automatic={...baseAttempt,request_id:randomUUID(),target_snapshot_id:randomUUID(),next_name:null,automatic:true};await ok(editor.c,'mutate_schedule_snapshot',automatic);
 sql(`update private.schedule_snapshots set captured_at=clock_timestamp()-interval '30 days' where id in ('${automatic.target_snapshot_id}','${baseAttempt.target_snapshot_id}')`);
 check(await ok(viewer.c,'expire_schedule_snapshots',sourceArgs)===0,'Old automatic snapshots retained with default policy');
 const setting={target_organization_id:org,request_id:randomUUID(),expected_version:0,retention_days:7,trash_min_role:'organizer'};
 await denied(organizer.c,'save_snapshot_policy',setting,'Organizer cannot change organization retention');
 await denied(outsider.c,'save_snapshot_policy',setting,'Foreign leadership cannot change retention');
 const settingReceipt=await ok(admin.c,'save_snapshot_policy',setting);check(settingReceipt.version===1,'Organization Admin configures retention');
 check(isDeepStrictEqual(await ok(admin.c,'save_snapshot_policy',setting),settingReceipt),'Settings exact retry does not duplicate version');
 await denied(owner.c,'save_snapshot_policy',{...setting,request_id:randomUUID()},'Stale policy update rejected');
 const protect=mutation(automatic.target_snapshot_id,1,'name',{next_name:'Keep automatic draft'});await ok(editor.c,'mutate_schedule_snapshot',protect);
 check(await ok(viewer.c,'expire_schedule_snapshots',sourceArgs)===0,'Named automatic snapshot is protected from expiry');
 const competing={...automatic,request_id:randomUUID(),target_snapshot_id:randomUUID()};await ok(editor.c,'mutate_schedule_snapshot',competing);
 sql(`update private.schedule_snapshots set captured_at=clock_timestamp()-interval '30 days' where id='${competing.target_snapshot_id}'`);
 const [namingRace,expiryRace]=await Promise.all([editor.c.rpc('mutate_schedule_snapshot',mutation(competing.target_snapshot_id,1,'name',{next_name:'Protected concurrent capture'})),viewer.c.rpc('expire_schedule_snapshots',sourceArgs)]);
 ensure(!expiryRace.error&&(!namingRace.error||namingRace.error.code==='PT409'),'Concurrent naming/expiry must resolve without transport or unexpected server failure');
 const competed=await read(owner.c,competing.target_snapshot_id);check(competed.version===2&&(!namingRace.error?competed.kind==='named'&&competed.deleted_at===null:competed.kind==='automatic'&&!!competed.deleted_at),'Concurrent naming and expiry resolve to one reviewed version without losing protected content');
 const expiring={...automatic,request_id:randomUUID(),target_snapshot_id:randomUUID()};await ok(editor.c,'mutate_schedule_snapshot',expiring);
 sql(`update private.schedule_snapshots set captured_at=clock_timestamp()-interval '30 days' where id='${expiring.target_snapshot_id}'`);
 check(await ok(viewer.c,'expire_schedule_snapshots',sourceArgs)===1,'Configured expiry moves only unnamed automatic snapshot to Trash');
 await denied(editor.c,'mutate_schedule_snapshot',mutation(expiring.target_snapshot_id,1,'name',{next_name:'Stale protect'}),'Stale naming cannot reverse an expiry transition');
 await denied(editor.c,'mutate_schedule_snapshot',mutation(baseAttempt.target_snapshot_id,1,'trash'),'Editor cannot Trash under default policy');
 await ok(organizer.c,'mutate_schedule_snapshot',mutation(expiring.target_snapshot_id,2,'restore_trash'));
 check((await read(viewer.c,expiring.target_snapshot_id)).deleted_at===null,'Organizer restores from recoverable Trash');
 await ok(owner.c,'save_snapshot_policy',{...setting,request_id:randomUUID(),expected_version:1,retention_days:null,trash_min_role:'editor'});
 await ok(editor.c,'mutate_schedule_snapshot',mutation(expiring.target_snapshot_id,3,'trash'));
 await denied(organizer.c,'mutate_schedule_snapshot',mutation(expiring.target_snapshot_id,4,'purge',{confirmed_purge:true}),'Organizer cannot permanently purge');
 await denied(admin.c,'mutate_schedule_snapshot',mutation(expiring.target_snapshot_id,4,'purge'),'Leadership purge requires explicit confirmation');
 const purge=mutation(expiring.target_snapshot_id,4,'purge',{confirmed_purge:true});const purged=await ok(admin.c,'mutate_schedule_snapshot',purge);
 check(isDeepStrictEqual(await ok(admin.c,'mutate_schedule_snapshot',purge),purged),'Confirmed fictional purge has exact retry after record removal');
 check((await ok(admin.c,'check_schedule_snapshot_request',{request_id:purge.request_id,...sourceArgs})).confirmed,'Purge receipt survives content removal');
 await denied(owner.c,'read_schedule_snapshot',{target_snapshot_id:expiring.target_snapshot_id},'Purged fictional record is unavailable');
 const restore=mutation(baseAttempt.target_snapshot_id,1,'restore_content',{source_version:1});await ok(editor.c,'mutate_schedule_snapshot',restore);
 const restored=await ok(owner.c,'read_schedule',sourceArgs);check(restored.id===source&&restored.display_name===unchanged.display_name&&restored.production_id===prod&&restored.document_version===2&&isDeepStrictEqual(restored.document.rows,draft.rows),'Content restore preserves current identity and placement');
 check(restored.document.meta.projectName==='Fictional Snapshot Production','Restoration uses current production label');
 await denied(editor.c,'mutate_schedule_snapshot',mutation(baseAttempt.target_snapshot_id,2,'restore_content',{source_version:1}),'Stale source restoration cannot overwrite newer saved version');
 const reviewed=await ok(organizer.c,'review_snapshot_copy',{target_snapshot_id:baseAttempt.target_snapshot_id,target_production_id:dest});
 const copy={request_id:randomUUID(),target_snapshot_id:baseAttempt.target_snapshot_id,expected_version:2,target_schedule_id:randomUUID(),source_version:reviewed.schedule.document_version,source_policy:reviewed.policy,target_production_id:dest,target_day_id:null,target_phase_id:null,next_display_name:'Fictional snapshot copy',next_slug:'copy-'+randomUUID()};
 await denied(editor.c,'review_snapshot_copy',{target_snapshot_id:baseAttempt.target_snapshot_id,target_production_id:dest},'Snapshot authorship does not grant Editor Save As New');
 const copied=await ok(organizer.c,'copy_schedule_snapshot',copy);check(copied.status==='confirmed','Organizer saves snapshot as a new schedule');
 check(isDeepStrictEqual(await ok(organizer.c,'copy_schedule_snapshot',copy),copied),'Copy retries retain exactly the same created identity');
 check((await ok(organizer.c,'check_snapshot_copy',{request_id:copy.request_id,target_schedule_id:copy.target_schedule_id})).id===copy.target_schedule_id,'Lost copy response is recoverable');
 check(isDeepStrictEqual((await ok(owner.c,'read_schedule',{target_schedule_id:copy.target_schedule_id})).document.rows,draft.rows),'Snapshot copy preserves full content');
 const restriction={target_id:randomUUID(),target_organization_id:org,target_production_id:prod,target_schedule_id:source,subject_role:'organizer',subject_user_id:null,denied_actions:['export'],expected_revision:0};await ok(owner.c,'set_schedule_restriction',restriction);
 await denied(organizer.c,'review_snapshot_copy',{target_snapshot_id:baseAttempt.target_snapshot_id,target_production_id:dest},'Source export restriction also blocks snapshot copy');
 await ok(owner.c,'set_schedule_restriction',{...restriction,expected_revision:1,denied_actions:[]});
 // Preserve an entire fictional legacy collection through the trusted catalogue.
 const collection=randomUUID(),run=randomUUID(),legacy=Array.from({length:137},(_,i)=>({id:'legacy-snapshot-'+i,savedAt:1700000000000+i,label:i===0?'Automatic':('Original '+i),data:documentFixture(i%3+1)}));
 const refs={'Fictional imported source':source},envelope={name:'Fictional imported source',snapshots:legacy,updatedAt:1700000000999};
 const importedIds=legacy.map(()=>randomUUID());
 sql(`begin;select private.import_related_record('${org}','b05-fixture','schedule-snapshots','fictional-key','','${collection}',1,${quote(envelope)},${quote(refs)},false,0,null,'${run}');`+legacy.map((entry,i)=>`select private.import_related_record('${org}','b05-fixture','schedule-snapshots','fictional-key','${entry.id}','${importedIds[i]}',1,${quote(entry)},${quote(refs)},false,0,null,'${run}');`).join('\n')+`select private.materialize_snapshot_collection('${collection}');commit;`);
 check(sql(`select count(*) from private.schedule_snapshots where schedule_id='${source}' and kind='imported'`)==='137','All 137 imported snapshots survive without a count cap');
 check(sql(`select bool_and(s.original_payload=c.payload and s.document=c.payload->'data' and s.name=c.payload->>'label' and s.original_id=c.source_item and extract(epoch from s.captured_at)*1000=(c.payload->>'savedAt')::numeric) from private.schedule_snapshots s join private.migration_records c on c.id=s.id where s.schedule_id='${source}' and s.kind='imported'`)==='t','Every original label, ID, timestamp and full payload preserved');
 check(sql(`select bool_and(original_id='legacy-snapshot-'||(original_order-1)) from private.schedule_snapshots where schedule_id='${source}' and kind='imported'`)==='t','Imported collection order preserved');
 await ok(owner.c,'save_snapshot_policy',{...setting,request_id:randomUUID(),expected_version:2,retention_days:1});
 await ok(viewer.c,'expire_schedule_snapshots',sourceArgs);
 check(sql(`select count(*) from private.schedule_snapshots where schedule_id='${source}' and kind='imported' and deleted_at is null`)==='137','Imported automatic records are exempt from retention');
 await ok(owner.c,'mutate_schedule_snapshot',mutation(importedIds[0],1,'trash'));await ok(owner.c,'mutate_schedule_snapshot',mutation(importedIds[0],2,'purge',{confirmed_purge:true}));
 check(sql(`select private.materialize_snapshot_collection('${collection}')`)==='0','Trusted replay does not resurrect a purged imported copy');
 check(sql(`select jsonb_array_length(payload->'snapshots') from private.migration_records where id='${collection}'`)==='137','Purge leaves the separately retained import catalogue intact');
 // Unsaved template use must travel with a snapshot without changing the source.
 const templateSource=randomUUID(),templateTarget=randomUUID(),templateId=randomUUID();
 for(const [id,production] of [[templateSource,dest],[templateTarget,prod]])await ok(owner.c,'create_schedule_in_production',{target_schedule_id:id,target_production_id:production,target_day_id:null,target_phase_id:null,next_display_name:'Fictional inherited template source',next_slug:'template-'+id,next_document:saved,schema_version:1});
 await ok(owner.c,'mutate_schedule_template',{request_id:randomUUID(),target_template_id:templateId,target_production_id:dest,expected_version:0,operation:'create',next_name:'Fictional restricted snapshot template',next_rows:saved.rows,source_schedule_id:templateSource,source_version:1});
 const templateRule={target_id:randomUUID(),target_organization_id:org,target_production_id:dest,target_schedule_id:templateSource,subject_role:null,subject_user_id:editor.id,denied_actions:['read'],expected_revision:0};await ok(owner.c,'set_schedule_restriction',templateRule);
 await ok(owner.c,'publish_schedule_template',{request_id:randomUUID(),target_template_id:templateId,target_production_id:dest,expected_version:1,publish:true});
 const templateReview=await ok(owner.c,'review_schedule_template_apply',{target_template_id:templateId,target_schedule_id:templateTarget});
 const templateCapture={...baseAttempt,request_id:randomUUID(),target_snapshot_id:randomUUID(),target_schedule_id:templateTarget,next_name:'Unsaved template draft',source_version:1,template_uses:[{id:templateId,version:templateReview.template.version,policy:templateReview.policy}]};
 await ok(owner.c,'mutate_schedule_snapshot',templateCapture);
 check(sql(`select count(*) from private.schedule_template_bindings where schedule_id='${templateTarget}'`)==='0','Capturing unsaved template use does not save bindings into the source schedule');
 await denied(editor.c,'read_schedule_snapshot',{target_snapshot_id:templateCapture.target_snapshot_id},'Snapshot enforces recorded template source restrictions before restore');
 await ok(owner.c,'mutate_schedule_snapshot',{...mutation(templateCapture.target_snapshot_id,1,'restore_content',{source_version:1}),target_schedule_id:templateTarget});
 await denied(editor.c,'read_schedule',{target_schedule_id:templateTarget},'Restored content retains template restrictions on the schedule');
 const templateCopyReview=await ok(owner.c,'review_snapshot_copy',{target_snapshot_id:templateCapture.target_snapshot_id,target_production_id:prod});
 const templateCopyId=randomUUID();await ok(owner.c,'copy_schedule_snapshot',{...copy,request_id:randomUUID(),target_snapshot_id:templateCapture.target_snapshot_id,expected_version:2,target_schedule_id:templateCopyId,source_version:templateCopyReview.schedule.document_version,source_policy:templateCopyReview.policy,target_production_id:prod,next_slug:'bound-copy-'+templateCopyId});
 await denied(editor.c,'read_schedule',{target_schedule_id:templateCopyId},'Save As New retains snapshot template restrictions');
 writeFileSync('/private/tmp/roseland-b05-browser-fixtures.json',JSON.stringify({project,org,prod,dest,source,owner:{email:owner.email,password:owner.password},editor:{email:editor.email,password:editor.password},organizer:{email:organizer.email,password:organizer.password},viewer:{email:viewer.email,password:viewer.password}},null,2),{mode:0o600});
 console.log(`B05 snapshot runtime: ${passed} assertions passed. Fictional browser fixtures saved privately.`);
}finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'}).catch(()=>undefined)));}
