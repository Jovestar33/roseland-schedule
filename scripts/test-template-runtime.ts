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
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
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
      input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 15000,
    }).trim();
  } catch { throw new Error('Local fixture SQL failed'); }
}
async function identity(label: string) {
  const c = client();
  const email = `auth-${label}-${randomUUID()}@example.test`;
  const password = `Local-${randomBytes(24).toString('hex')}-9aA`;
  const signup = await c.auth.signUp({ email, password });
  ensure(!signup.error && signup.data.user, 'Local synthetic signup failed');
  const id = signup.data.user.id;
  ensure(/^[0-9a-f-]{36}$/.test(id), 'Unexpected synthetic user ID');
  await c.auth.signOut();
  const login = await c.auth.signInWithPassword({ email, password });
  ensure(!login.error && login.data.session && login.data.user.id === id, 'Password login failed');
  const verified = await c.auth.getUser();
  ensure(!verified.error && verified.data.user.id === id, 'Auth could not verify the login-issued session');
  return { c, id, email, password };
}

ensure(['roseland-templates-20260917','roseland-template-replay-20260917'].includes(project),'Only the new isolated template stack is allowed');
let passed=0;
function check(value:unknown,label:string){ensure(value,label);passed++;console.log('PASS '+label);}
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>){const r=await c.rpc(name,args);ensure(!r.error,JSON.stringify(r.error));return r.data;}
async function denied(c:SupabaseClient,name:string,args:Record<string,unknown>,label:string){const r=await c.rpc(name,args);check(!!r.error,label);}
try {
 const owner=await identity('template-owner'),admin=await identity('template-admin'),organizer=await identity('template-organizer'),editor=await identity('template-editor'),viewer=await identity('template-viewer'),other=await identity('template-other-production'),outsider=await identity('template-outsider');
 const org=randomUUID(),prod=randomUUID(),prodB=randomUUID(),orgB=randomUUID(),foreign=randomUUID(),source=randomUUID(),sourceB=randomUUID();
 sql(`begin;insert into public.organizations(id,name,slug) values('${org}','Fictional Template Studio','template-${org}'),('${orgB}','Other Fictional Studio','template-${orgB}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
 ('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${org}','${organizer.id}','member','active',now()),('${org}','${editor.id}','member','active',now()),('${org}','${viewer.id}','member','active',now()),('${org}','${other.id}','member','active',now()),('${orgB}','${outsider.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional Harbor Production','harbor-${prod}'),('${prodB}','${org}','Fictional River Production','river-${prodB}'),('${foreign}','${orgB}','Other Organization Production','foreign-${foreign}');
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${organizer.id}','organizer','active',now()),('${org}','${prod}','${editor.id}','editor','active',now()),('${org}','${prod}','${viewer.id}','viewer','active',now()),('${org}','${prodB}','${other.id}','editor','active',now());commit;`);
 const original=documentFixture(),withSun=[...original.rows,{...original.rows[0],action:'Sunrise',sunLocked:true}],doc={...original,rows:withSun};
 for(const [id,document] of [[source,doc],[sourceB,documentFixture(2)]] as const)await ok(owner.c,'create_schedule_in_production',{target_schedule_id:id,target_production_id:prod,target_day_id:null,target_phase_id:null,next_display_name:id===source?'Fictional template source':'Second fictional source',next_slug:'source-'+id,next_document:document,schema_version:1});
 const a={request_id:randomUUID(),target_template_id:randomUUID(),target_production_id:prod,expected_version:0,operation:'create',next_name:'Harbor reusable day',next_rows:withSun,source_schedule_id:source,source_version:1};
 await denied(viewer.c,'mutate_schedule_template',a,'Viewer cannot create template');
 await denied(other.c,'mutate_schedule_template',a,'Same-organization other-production Editor cannot create template');
 await denied(outsider.c,'mutate_schedule_template',a,'Other organization owner cannot create template');
 const created=await ok(editor.c,'mutate_schedule_template',a);check(created.confirmed&&created.version===1,'Production Editor creates a production-only template');
 const read=await ok(viewer.c,'read_schedule_template',{target_template_id:a.target_template_id});check(read.name===a.next_name&&isDeepStrictEqual(read.rows,original.rows),'Authorized Viewer receives every original row field and generated sun rows are omitted');
 check(read.can_manage===false,'Viewer receives read-only template controls');
 const retry=await ok(editor.c,'mutate_schedule_template',a);check(isDeepStrictEqual(retry,created),'Exact lost-acknowledgement retry returns original receipt without another version');
 await denied(editor.c,'mutate_schedule_template',{...a,next_name:'Changed nonce reuse'},'Same request ID cannot substitute changed content');
 check((await ok(other.c,'list_schedule_templates',{target_production_id:prod})).length===0,'Other-production member cannot enumerate template names');
 check((await ok(outsider.c,'list_schedule_templates',{target_production_id:prod})).length===0,'Cross-organization list reveals no templates');
 await denied(outsider.c,'read_schedule_template',{target_template_id:a.target_template_id},'Cross-organization guessed UUID cannot read rows');
 await denied(editor.c,'mutate_schedule_template',{...a,request_id:randomUUID(),target_template_id:randomUUID(),next_name:' HARBOR REUSABLE DAY '},'Case/whitespace name collision is atomic and never overwrites');
 await denied(owner.c,'mutate_schedule_template',{...a,request_id:randomUUID(),target_template_id:randomUUID(),target_production_id:prodB},'Source cannot be copied into another production through template creation');
 await denied(editor.c,'mutate_schedule_template',{...a,request_id:randomUUID(),target_template_id:randomUUID(),next_name:'Malformed',next_rows:[{unexpected:'not silently removed'}]},'Unknown row fields are rejected rather than silently stripped');
 const replace={...a,request_id:randomUUID(),expected_version:1,operation:'replace',next_name:'Harbor reusable day',next_rows:documentFixture(2).rows,source_schedule_id:sourceB};
 const replaced=await ok(editor.c,'mutate_schedule_template',replace);check(replaced.version===2,'Replacement advances optimistic version and accepts a second authorized source');
 await denied(editor.c,'mutate_schedule_template',{...replace,request_id:randomUUID()},'Stale replacement cannot overwrite a newer template');
 const policyId=randomUUID();const policy={target_id:policyId,target_organization_id:org,target_production_id:prod,target_schedule_id:source,subject_role:'viewer',subject_user_id:null,denied_actions:['read'],expected_revision:0};
 await ok(owner.c,'set_schedule_restriction',policy);
 check((await ok(viewer.c,'list_schedule_templates',{target_production_id:prod})).length===0,'Retained source restriction hides template even after replacement from a different schedule');
 await denied(viewer.c,'read_schedule_template',{target_template_id:a.target_template_id},'Template reading cannot bypass old source-specific read restriction');
 await ok(owner.c,'set_schedule_restriction',{...policy,expected_revision:1,denied_actions:[]});
 const exportId=randomUUID(),exportPolicy={...policy,target_id:exportId,subject_role:'editor',denied_actions:['export']};await ok(owner.c,'set_schedule_restriction',exportPolicy);
 await denied(editor.c,'read_schedule_template',{target_template_id:a.target_template_id},'Source export restriction also prevents reuse through templates');
 await denied(editor.c,'mutate_schedule_template',{...a,request_id:randomUUID(),target_template_id:randomUUID(),next_name:'Forbidden export'},'Template creation cannot bypass source export restriction');
 await ok(owner.c,'set_schedule_restriction',{...exportPolicy,expected_revision:1,denied_actions:[]});
 const denyEditorId=randomUUID(),denyEditor={...policy,target_id:denyEditorId,target_schedule_id:null,subject_role:'editor',denied_actions:['edit']};await ok(owner.c,'set_schedule_restriction',denyEditor);
 await denied(editor.c,'mutate_schedule_template',{...replace,request_id:randomUUID(),expected_version:2},'Production edit denial applies to existing template replacement');
 await ok(owner.c,'set_schedule_restriction',{...denyEditor,expected_revision:1,denied_actions:[]});
 const renamed=await ok(admin.c,'mutate_schedule_template',{request_id:randomUUID(),target_template_id:a.target_template_id,target_production_id:prod,expected_version:2,operation:'rename',next_name:'Renamed reusable day'});check(renamed.version===3,'Organization Admin can rename under effective scope');
 const write={request_id:randomUUID(),target_template_id:a.target_template_id,target_production_id:prod,expected_version:3,operation:'trash'};
 const trashPolicy={...policy,target_id:randomUUID(),target_schedule_id:null,subject_role:'editor',denied_actions:['trash']};await ok(owner.c,'set_schedule_restriction',trashPolicy);
 await denied(editor.c,'mutate_schedule_template',write,'Explicit Trash restriction blocks template Trash');
 await ok(owner.c,'set_schedule_restriction',{...trashPolicy,expected_revision:1,denied_actions:[]});
 const trashed=await ok(editor.c,'mutate_schedule_template',write);check(trashed.version===4,'Template Editor uses recoverable Trash');
 check((await ok(viewer.c,'list_schedule_templates',{target_production_id:prod,include_deleted:true})).length===0,'Viewer cannot enumerate template Trash');
 await denied(viewer.c,'read_schedule_template',{target_template_id:a.target_template_id},'Viewer cannot read deleted template by ID');
 const deleted=await ok(organizer.c,'read_schedule_template',{target_template_id:a.target_template_id});check(!!deleted.deleted_at&&deleted.rows.length===2,'Organizer can recover full deleted template content');
 const restore={request_id:randomUUID(),target_template_id:a.target_template_id,target_production_id:prod,expected_version:4,operation:'restore',next_name:'Renamed reusable day'};
 check((await ok(organizer.c,'mutate_schedule_template',restore)).version===5,'Restore retains template identity and content');
 const concurrent={...replace,expected_version:5,next_name:'Renamed reusable day'};
 const pair=await Promise.all([editor.c.rpc('mutate_schedule_template',{...concurrent,request_id:randomUUID()}),organizer.c.rpc('mutate_schedule_template',{...concurrent,request_id:randomUUID()})]);
 check(pair.filter(v=>!v.error).length===1&&pair.filter(v=>v.error?.code==='PT409').length===1,'Competing replacements commit exactly one version');
 check((await ok(editor.c,'check_schedule_template_request',{request_id:a.request_id,target_production_id:prod})).version===1,'Old exact receipt stays identifiable after later versions');
 check((await ok(viewer.c,'check_schedule_template_request',{request_id:a.request_id,target_production_id:prod})).confirmed===false,'Another actor cannot inspect a private operation receipt');
 sql(`update public.production_memberships set status='suspended' where production_id='${prod}' and user_id='${editor.id}';`);
 await denied(editor.c,'read_schedule_template',{target_template_id:a.target_template_id},'Role revocation blocks fresh template delivery');
 await denied(editor.c,'mutate_schedule_template',a,'Removed member cannot use a committed receipt to regain data');
 sql(`update public.production_memberships set status='active' where production_id='${prod}' and user_id='${editor.id}';`);
 const sourceSaved=await ok(owner.c,'read_schedule',{target_schedule_id:source});check(sourceSaved.document_version===1&&isDeepStrictEqual(sourceSaved.document.rows,withSun),'All template operations leave the source schedule unchanged');
 // Deliberate organization publication: only reviewed content reaches this audience.
 async function currentTemplate(){return ok(owner.c,'read_schedule_template',{target_template_id:a.target_template_id});}
 let latest=await currentTemplate();
 check(latest.published_at===null,'New and edited templates default to production-only');
 const pub={request_id:randomUUID(),target_template_id:a.target_template_id,target_production_id:prod,expected_version:latest.version,publish:true};
 await denied(editor.c,'publish_schedule_template',pub,'Production Editor cannot publish across the organization');
 await denied(viewer.c,'publish_schedule_template',pub,'Production Viewer cannot publish');
 await denied(other.c,'publish_schedule_template',{...pub,target_production_id:prodB},'Another production cannot substitute its authority');
 await denied(outsider.c,'publish_schedule_template',pub,'Foreign organization leadership cannot publish');
 const published=await ok(organizer.c,'publish_schedule_template',pub);check(published.operation==='publish'&&published.version===latest.version+1,'Source Production Organizer deliberately publishes');
 check(isDeepStrictEqual(await ok(organizer.c,'publish_schedule_template',pub),published),'Lost publication acknowledgement retries exactly once');
 await denied(organizer.c,'publish_schedule_template',{...pub,publish:false},'Publication receipt cannot substitute an opposite action');
 const organizationRead=await ok(other.c,'read_schedule_template',{target_template_id:a.target_template_id});
 check(isDeepStrictEqual(organizationRead.rows,documentFixture(2).rows)&&!organizationRead.can_manage&&!organizationRead.can_publish,'Other-production member receives published rows without template write authority');
 check((await ok(other.c,'list_organization_templates',{target_organization_id:org})).some((t:{id:string})=>t.id===a.target_template_id),'Organization catalogue discovers intentionally published template');
 check((await ok(outsider.c,'list_organization_templates',{target_organization_id:org})).length===0,'Published templates never cross organizations');
 await denied(outsider.c,'read_schedule_template',{target_template_id:a.target_template_id},'Published UUID does not expose rows across organizations');
 await denied(other.c,'read_schedule',{target_schedule_id:source},'Publication does not grant source schedule access');
 await denied(other.c,'read_schedule',{target_schedule_id:sourceB},'Publication does not grant replacement source access');
 const publishedViewerPolicy={...policy,target_id:randomUUID(),subject_role:'viewer',denied_actions:['read']};
 await ok(owner.c,'set_schedule_restriction',publishedViewerPolicy);
 await denied(other.c,'read_schedule_template',{target_template_id:a.target_template_id},'Source Viewer restriction binds a published recipient without a source-production role');
 check((await ok(other.c,'list_organization_templates',{target_organization_id:org})).length===0,'Restricted publication hides even its catalogue metadata');
 await ok(owner.c,'set_schedule_restriction',{...publishedViewerPolicy,expected_revision:1,denied_actions:[]});
 const recipientPolicy={...policy,target_id:randomUUID(),subject_role:null,subject_user_id:other.id,denied_actions:['export']};
 await ok(owner.c,'set_schedule_restriction',recipientPolicy);
 await denied(other.c,'read_schedule_template',{target_template_id:a.target_template_id},'Recipient-specific source export denial binds published content');
 await ok(owner.c,'set_schedule_restriction',{...recipientPolicy,expected_revision:1,denied_actions:[]});
 const publishDeny={...policy,target_id:randomUUID(),subject_role:'organizer',denied_actions:['export']};
 await ok(owner.c,'set_schedule_restriction',publishDeny);
 await denied(organizer.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:published.version,publish:false},'Organizer authority cannot bypass source export restrictions');
 await ok(owner.c,'set_schedule_restriction',{...publishDeny,expected_revision:1,denied_actions:[]});
 const unpub={...pub,request_id:randomUUID(),expected_version:published.version,publish:false};
 const unpublished=await ok(admin.c,'publish_schedule_template',unpub);check(unpublished.operation==='unpublish','Organization Admin can withdraw publication');
 await denied(other.c,'read_schedule_template',{target_template_id:a.target_template_id},'Unpublication immediately prevents fresh organization delivery');
 await ok(organizer.c,'publish_schedule_template',pub);
 check((await currentTemplate()).published_at===null,'Retrying an old publication receipt never republishes withdrawn content');
 await denied(owner.c,'publish_schedule_template',{...pub,request_id:randomUUID()},'Stale review cannot publish a changed template');
 latest=await currentTemplate();
 const ownerPublished=await ok(owner.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version});
 check(ownerPublished.operation==='publish','Organization Super Admin can deliberately publish');
 const edited=await ok(editor.c,'mutate_schedule_template',{...replace,request_id:randomUUID(),expected_version:ownerPublished.version,next_name:'Editor revised draft',next_rows:original.rows});
 check(edited.version===ownerPublished.version+1&&(await currentTemplate()).published_at===null,'Editor content replacement withdraws publication until an authorized fresh review');
 await denied(other.c,'read_schedule_template',{target_template_id:a.target_template_id},'Editor cannot silently deliver a replacement to the organization');
 const republished=await ok(organizer.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:edited.version});
 sql(`update public.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${other.id}';`);
 await denied(other.c,'read_schedule_template',{target_template_id:a.target_template_id},'Suspended organization membership revokes published template delivery');
 sql(`update public.organization_memberships set status='active' where organization_id='${org}' and user_id='${other.id}';`);
 const publicationTrash=await ok(editor.c,'mutate_schedule_template',{...write,request_id:randomUUID(),expected_version:republished.version});
 check((await currentTemplate()).published_at===null,'Recoverable Trash withdraws publication');
 await ok(organizer.c,'mutate_schedule_template',{...restore,request_id:randomUUID(),expected_version:publicationTrash.version,next_name:'Editor revised draft'});
 check((await currentTemplate()).published_at===null,'Restoring from Trash does not silently republish');
 // Additional policy and lifecycle edges use current versions, never reset fixtures.
 latest=await currentTemplate();
 sql(`update public.production_memberships set role='organizer' where production_id='${prodB}' and user_id='${other.id}';`);
 await denied(other.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version},'Organizer of another production cannot publish this production template');
 const organizeDeny={...policy,target_id:randomUUID(),target_schedule_id:null,subject_role:'organizer',denied_actions:['organize']};
 await ok(owner.c,'set_schedule_restriction',organizeDeny);
 await denied(organizer.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version},'Production organize denial binds the publishing Organizer');
 await ok(owner.c,'set_schedule_restriction',{...organizeDeny,expected_revision:1,denied_actions:[]});
 const adminDeny={...policy,target_id:randomUUID(),subject_role:'admin',denied_actions:['read']};
 await ok(owner.c,'set_schedule_restriction',adminDeny);
 await denied(admin.c,'publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version},'Organization leadership cannot override an explicit source read denial');
 await ok(owner.c,'set_schedule_restriction',{...adminDeny,expected_revision:1,denied_actions:[]});
 const publishRace=await Promise.all([organizer.c.rpc('publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version}),admin.c.rpc('publish_schedule_template',{...pub,request_id:randomUUID(),expected_version:latest.version})]);
 check(publishRace.filter(v=>!v.error).length===1&&publishRace.filter(v=>v.error?.code==='PT409').length===1,'Competing publication reviews commit exactly one version');
 sql(`update public.production_memberships set status='suspended' where production_id='${prod}' and user_id='${viewer.id}';`);
 await denied(viewer.c,'read_schedule_template',{target_template_id:a.target_template_id},'Publication does not bypass a suspended source-production membership');
 sql(`update public.production_memberships set status='active' where production_id='${prod}' and user_id='${viewer.id}';`);
 const revokePub={...pub,request_id:randomUUID(),expected_version:(await currentTemplate()).version,publish:false};
 await ok(organizer.c,'publish_schedule_template',revokePub);
 sql(`update public.production_memberships set role='editor' where production_id='${prod}' and user_id='${organizer.id}';`);
 await denied(organizer.c,'publish_schedule_template',revokePub,'Revoked publishing role cannot retry a privileged publication receipt');
 sql(`update public.production_memberships set role='organizer' where production_id='${prod}' and user_id='${organizer.id}';`);
 latest=await currentTemplate();
 const lastTrash=await ok(editor.c,'mutate_schedule_template',{...write,request_id:randomUUID(),expected_version:latest.version});
 const collision={...a,request_id:randomUUID(),target_template_id:randomUUID(),next_name:latest.name};
 await ok(editor.c,'mutate_schedule_template',collision);
 await denied(organizer.c,'mutate_schedule_template',{...restore,request_id:randomUUID(),expected_version:lastTrash.version,next_name:latest.name},'Restore name collision never overwrites a later template');
 check((await currentTemplate()).version===lastTrash.version,'Failed restore leaves the recoverable template unchanged');
 await ok(organizer.c,'mutate_schedule_template',{...restore,request_id:randomUUID(),expected_version:lastTrash.version,next_name:'Recovered fictional template'});
 const allSources=await Promise.all([ok(owner.c,'read_schedule',{target_schedule_id:source}),ok(owner.c,'read_schedule',{target_schedule_id:sourceB})]);
 check(allSources.every(v=>v.document_version===1)&&isDeepStrictEqual(allSources[0].document.rows,withSun)&&isDeepStrictEqual(allSources[1].document.rows,documentFixture(2).rows),'Publication and all lifecycle checks preserve both source schedules at their original saved version and rows');
 // A separate source probes retained restrictions after a legitimate fictional Move.
 const moveSource=randomUUID(),moveTemplate=randomUUID();
 await ok(owner.c,'create_schedule_in_production',{target_schedule_id:moveSource,target_production_id:prod,target_day_id:null,target_phase_id:null,next_display_name:'Fictional moved template source',next_slug:'move-'+moveSource,next_document:original,schema_version:1});
 await ok(owner.c,'mutate_schedule_template',{...a,request_id:randomUUID(),target_template_id:moveTemplate,next_name:'Moved-source template',next_rows:original.rows,source_schedule_id:moveSource});
 const moveReview=await ok(owner.c,'review_schedule_transfer',{target_schedule_id:moveSource,target_production_id:prodB});
 await ok(owner.c,'move_schedule',{request_id:randomUUID(),target_schedule_id:moveSource,target_production_id:prodB,target_day_id:null,target_phase_id:null,expected_version:1,expected_policy:moveReview.policy,approve_request:false});
 const movedTrashDeny={...policy,target_id:randomUUID(),target_production_id:prodB,target_schedule_id:moveSource,subject_role:'owner',denied_actions:['trash']};
 await ok(owner.c,'set_schedule_restriction',movedTrashDeny);
 await denied(owner.c,'mutate_schedule_template',{...write,request_id:randomUUID(),target_template_id:moveTemplate,expected_version:1},'Source Trash restriction still binds its template after the source moves production');
 await ok(owner.c,'set_schedule_restriction',{...movedTrashDeny,expected_revision:1,denied_actions:[]});
 const originalScopeDeny={...policy,target_id:randomUUID(),target_schedule_id:null,subject_role:'owner',denied_actions:['export']};
 await ok(owner.c,'set_schedule_restriction',originalScopeDeny);
 await denied(owner.c,'read_schedule_template',{target_template_id:moveTemplate},'Original template-production export restriction still binds after all sources move');
 await ok(owner.c,'set_schedule_restriction',{...originalScopeDeny,expected_revision:1,denied_actions:[]});
 check((await ok(owner.c,'read_schedule',{target_schedule_id:moveSource})).document_version===2,'Rejected moved-source template operations never modify the source schedule');
 const anon=client();await denied(anon,'read_schedule_template',{target_template_id:a.target_template_id},'Anonymous direct RPC is denied');
 const forbiddenTable=await editor.c.schema('private').from('schedule_templates').select('*');check(!!forbiddenTable.error,'Private template table cannot bypass the authenticated RPC');
 const perms=sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='template_actor_can' and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'));`);check(perms==='0','Private authorization helper is not client or service-role callable');
 if(args.includes('--serve'))writeFileSync('/private/tmp/roseland-template-browser-fixtures.json',JSON.stringify({project,org,prod,prodB,source,sourceB,template:a.target_template_id,owner:{email:owner.email,password:owner.password},editor:{email:editor.email,password:editor.password},viewer:{email:viewer.email,password:viewer.password}},null,2),{mode:0o600});
 console.log(`PASS ${passed} genuine local template Auth/API checks`);
}finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'}).catch(()=>undefined)));}
