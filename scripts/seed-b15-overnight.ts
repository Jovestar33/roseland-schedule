// Bounded, disposable local fixtures for the authorized overnight journeys.
// Setup uses admin Auth/SQL; all permission assertions use genuine user sessions.
import {createClient} from '@supabase/supabase-js';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const privateFile='/private/tmp/roseland-b15-overnight-fixtures.json';
if(existsSync(privateFile))throw Error('Fixtures already exist; reuse them');
const project='roseland-b14-destination-g2',root='/private/tmp/'+project;
if(existsSync(root+'/supabase/.temp/project-ref')||!readFileSync(root+'/supabase/config.toml','utf8').includes('project_id = "'+project+'"'))throw Error('Owned unlinked local project required');
const config=JSON.parse(readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Expected loopback API');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input:any,init:any)=>{const u=new URL(typeof input==='string'?input:input.url??input.href);if(u.origin!==config.API_URL)throw Error('Nonlocal request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}};
const client=()=>createClient(config.API_URL,config.ANON_KEY,options),admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
function q(v:unknown){return "'"+String(v).replaceAll("'","''")+"'";}
function sql(query:string){return execFileSync('docker',['exec','-i','supabase_db_'+project,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function totp(secret:string){let bits='';for(const c of secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2))),n=Buffer.alloc(8);n.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(n).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function identity(label:string){const email=`overnight-${label}-${randomUUID()}@example.test`,password='Fictional1!'+randomBytes(24).toString('hex');const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});if(r.error||!r.data.user)throw Error('Fixture identity setup failed');const c=client();if((await c.auth.signInWithPassword({email,password})).error)throw Error('Fixture sign-in failed');return {id:r.data.user.id,email,password,c};}
const leadership=await identity('admin'),member=await identity('member'),outsider=await identity('outsider');
const clean=(u:typeof leadership)=>({id:u.id,email:u.email,password:u.password});
// Save generated account access immediately, so a setup failure never loses it.
const fixtures:any={project,leadership:clean(leadership),member:clean(member),outsider:clean(outsider),organizations:[]};
const save=()=>writeFileSync(privateFile,JSON.stringify(fixtures,null,2),{mode:0o600});save();
const enrollment=await leadership.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Overnight fictional Admin'});
if(enrollment.error||!enrollment.data)throw Error('Fixture MFA setup failed');
fixtures.leadership.factor={id:enrollment.data.id,secret:enrollment.data.totp.secret};save();
if((await leadership.c.auth.mfa.challengeAndVerify({factorId:fixtures.leadership.factor.id,code:totp(fixtures.leadership.factor.secret)})).error)throw Error('Fixture MFA verification failed');
const document={meta:{town:'Fictional overnight town'},rows:[{action:'Shoot',dur:'00:30',notes:'Fictional overnight note'}]};
for(const [label,role] of [['North','editor'],['South','viewer']]){
 const org=randomUUID(),prod=randomUUID(),schedule=randomUUID();
 sql(`begin;
 insert into public.organizations(id,name,slug) values('${org}','Overnight ${label} Studio','overnight-${org}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${leadership.id}','admin','active',now()),('${org}','${member.id}','member','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','${label} production','overnight-${prod}');
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${member.id}','${role}','active',now());
 insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by) values('${schedule}','${org}','${prod}','Overnight ${label} day','overnight-${schedule}',${q(JSON.stringify(document))},'${leadership.id}','${leadership.id}');commit;`);
 fixtures.organizations.push({id:org,name:`Overnight ${label} Studio`,production:prod,schedule,memberRole:role});save();
}
const checks:string[]=[];
for(const u of [leadership,member,outsider]){
 const r=await u.c.from('schedules').select('id').in('id',fixtures.organizations.map((o:any)=>o.schedule));
 if(r.error||r.data.length!==(u===outsider?0:2))throw Error('Session isolation assertion failed');checks.push(u===outsider?'Outsider sees no new schedules':'Genuine '+(u===leadership?'AAL2 Admin':'member')+' reads two assigned schedules');
}
const s=fixtures.organizations[1].schedule;
if(!(await member.c.rpc('update_schedule_document',{target_schedule_id:s,expected_version:1,next_document:document,schema_version:1})).error)throw Error('Viewer mutation was accepted');checks.push('South Viewer write denied through normal RPC');
mkdirSync('evidence/b15-overnight/roles',{recursive:true});
writeFileSync('evidence/b15-overnight/roles/setup.json',JSON.stringify({project,created:{identities:3,organizations:2,productions:2,schedules:2},checks,scope:'Only new disposable fixtures; existing memberships and samples unchanged',browserJourneys:'not asserted by setup'},null,2)+'\n');
console.log('Bounded local fixtures prepared; '+checks.length+' genuine-session checks passed. Private access saved locally.');
