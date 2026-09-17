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

let passed=0;const check=(value:unknown,label:string)=>{ensure(value,label);passed++;console.log('PASS '+label);};
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>){const result=await c.rpc(name,args);ensure(!result.error,JSON.stringify(result.error));return result.data;}
try{
 const owner=await identity('presentation-owner'),admin=await identity('presentation-admin'),organizer=await identity('presentation-organizer'),editor=await identity('presentation-editor'),viewer=await identity('presentation-viewer'),outsider=await identity('presentation-outsider');
 const org=randomUUID(),foreign=randomUUID(),prod=randomUUID();
 sql(`insert into public.organizations(id,name,slug) values('${org}','Fictional Presentation Studio','presentation-${org}'),('${foreign}','Fictional Foreign Presentation','presentation-${foreign}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${org}','${organizer.id}','member','active',now()),('${org}','${editor.id}','member','active',now()),('${org}','${viewer.id}','member','active',now()),('${foreign}','${outsider.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional Appearance Production','appearance-${prod}');
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${organizer.id}','organizer','active',now()),('${org}','${prod}','${editor.id}','editor','active',now()),('${org}','${prod}','${viewer.id}','viewer','active',now());`);
 const readArgs={target_organization_id:org};
 check((await ok(viewer.c,'read_organization_presentation',readArgs)).version===0,'Active member reads default organization configuration');
 check(!(await ok(organizer.c,'read_organization_presentation',readArgs)).can_manage,'Production Organizer gets no organization settings authority');
 const config={actions:[{name:'Fictional Scene',color:'aShoot'}],colors:{'--pink':'#abcdef'},actionStyles:{aShoot:{bg:'#112233',text:'#ffffff'}},labels:{colAction:'Fictional Activity',metaTown:'Fictional Place'},logo:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>').toString('base64')};
 const a={target_organization_id:org,request_id:randomUUID(),expected_version:0,next_config:config};
 for(const [actor,label] of [[organizer,'Organizer'],[editor,'Editor'],[viewer,'Viewer'],[outsider,'Other organization owner']] as const)check(!!(await actor.c.rpc('save_organization_presentation',a)).error,label+' cannot write organization appearance');
 const receipt=await ok(owner.c,'save_organization_presentation',a);check(receipt.confirmed&&receipt.version===1,'Organization Super Admin saves the complete configuration');
 check(isDeepStrictEqual(await ok(owner.c,'save_organization_presentation',a),receipt),'Exact lost-response retry produces no duplicate version');
 const read=await ok(viewer.c,'read_organization_presentation',readArgs);check(isDeepStrictEqual(read.config,config)&&read.version===1,'Viewer reads every saved configuration field intact');
 check(!!(await outsider.c.rpc('read_organization_presentation',readArgs)).error,'Foreign organization cannot read configuration');
 check(!!(await admin.c.rpc('save_organization_presentation',a)).error,'Receipt is bound to the original account');
 check(!!(await owner.c.rpc('save_organization_presentation',{...a,next_config:{}})).error,'Retried request cannot replace its original payload');
 const b={...a,request_id:randomUUID(),expected_version:1,next_config:{labels:{colAction:'Admin reviewed label'}}};await ok(admin.c,'save_organization_presentation',b);
 check((await ok(owner.c,'read_organization_presentation',readArgs)).version===2,'Organization Admin can save a newer version');
 await ok(owner.c,'save_organization_presentation',a);check((await ok(owner.c,'read_organization_presentation',readArgs)).version===2,'Old exact receipt never overwrites a later settings save');
 check(!!(await owner.c.rpc('save_organization_presentation',{...a,request_id:randomUUID()})).error,'Stale version cannot overwrite another administrator');
 const malformed=[{extra:true},{colors:{'--evil':'#ffffff'}},{colors:{'--pink':'url(https://example.test)'}},{labels:{colAction:'bad\nlabel'}},{labels:{secret:'No'}},{actions:[{name:'Other',color:''}]},{actions:[{name:'Same',color:''},{name:'same',color:''}]},{actionStyles:{aShoot:{bg:'#ffffff',text:'red'}}},{logo:'https://example.test/logo.png'},{logo:'data:text/html;base64,SGk='}];
 for(let i=0;i<malformed.length;i++)check(!!(await owner.c.rpc('save_organization_presentation',{...a,request_id:randomUUID(),expected_version:2,next_config:malformed[i]})).error,'Malformed configuration '+(i+1)+' rejected without partial stripping');
 check((await ok(owner.c,'read_organization_presentation',readArgs)).version===2,'Denied and malformed writes do not advance the version');
 sql(`update public.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${admin.id}';`);
 check(!!(await admin.c.rpc('save_organization_presentation',{...b,request_id:randomUUID(),expected_version:2})).error,'Suspended Admin cannot save');
 check(!!(await admin.c.rpc('read_organization_presentation',readArgs)).error,'Suspended member cannot read');
 const anon=client();check(!!(await anon.rpc('read_organization_presentation',readArgs)).error,'Anonymous reads denied');
 const privateRead=await viewer.c.schema('private').from('organization_presentation').select('*');check(!!privateRead.error,'Private table cannot bypass authenticated RPC');
 check(sql(`select count(*) from private.organization_presentation_receipts where organization_id='${org}';`)==='2','Exactly two accepted saves have receipts');
 const contenders=await Promise.all([owner.c.rpc('save_organization_presentation',{...a,request_id:randomUUID(),expected_version:2,next_config:{labels:{colAction:'Contender A'}}}),owner.c.rpc('save_organization_presentation',{...a,request_id:randomUUID(),expected_version:2,next_config:{labels:{colAction:'Contender B'}}})]);check(contenders.filter(x=>!x.error).length===1,'Concurrent settings writers serialize; exactly one baseline wins');
 console.log('PASS '+passed+' genuine local organization presentation Auth/API checks');
}finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'}).catch(()=>undefined)));}
