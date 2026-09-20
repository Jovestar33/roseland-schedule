// Fresh fictional data only. Existing organizations and records are never updated.
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {fs,login,rpc,fixtures}=require('./pre-review-common.cjs');
const file='evidence/consolidated-hubs/fixtures.json';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
(async()=>{const clients=[];try{
 if(fs.existsSync(file))throw Error('Fixture manifest already exists; do not reseed');
 const c=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));clients.push(c);
 const admin=await login(fixtures.leadership);clients.push(admin);
 const actor=(await c.auth.getUser()).data.user.id,owner=(await admin.auth.getUser()).data.user.id;
 const org=randomUUID(),productions=['Fictional Travel Series','Fictional Studio Campaign','Fictional Documentary'].map(name=>({id:randomUUID(),name,phases:[],schedules:[]}));
 const manifest={organization:org,actor,productions};fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
 let sql=`begin;insert into public.organizations(id,name,slug) values(${quote(org)},'Library hubs — fictional review',${quote('hub-review-'+org)});insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values(${quote(org)},${quote(owner)},'owner','active',now()),(${quote(org)},${quote(actor)},'member','active',now());`;
 for(const p of productions)sql+=`insert into public.productions(id,organization_id,name,slug) values(${quote(p.id)},${quote(org)},${quote(p.name)},${quote('production-'+p.id)});insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values(${quote(org)},${quote(p.id)},${quote(actor)},'organizer','active',now());`;
 execFileSync('docker',['exec','-i','supabase_db_roseland-b14-destination-g2','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:sql+'commit;',encoding:'utf8'});
 const source=JSON.parse(fs.readFileSync('evidence/professional-documents/baseline.json')).records.find(r=>r.display_name==='B15 ordinary fictional day');
 for(const [index,p] of productions.entries()){
  const names=index===0?['Mountain hub','Coastal hub','Upcoming hub']:index===1?['Studio days','Location days']:['Interviews','Field work'];
  for(const name of names){const id=randomUUID();await rpc(c,'save_library_phase',{target_production_id:p.id,target_phase_id:id,next_name:name,expected_version:null});p.phases.push({id,name});}
  const day=randomUUID();const result=await c.from('production_days').insert({id:day,organization_id:org,production_id:p.id,phase_id:p.phases[0].id,day_number:1,calendar_date:'2026-10-12',position:0,created_by:actor,updated_by:actor});if(result.error)throw Error(result.error.message);
  for(const [n,name] of (index===0?['Pine Ridge scout','Cedar Falls shoot','Harbor visit','Production overview']:index===1?['Product close-ups','Talent session','City exteriors','Campaign overview']:['Contributor interview','Archive interview','River walk','Documentary overview']).entries()){
   const id=randomUUID(),phase=n<2?p.phases[0]:n===2?p.phases[1]:null,doc=structuredClone(source.document);doc.meta.projectName=p.name;doc.meta.phase=phase?.name??'';doc.meta.town=name;doc.meta.date=n===1?'2026-10-12':'';
   await rpc(c,'create_schedule_in_production',{target_schedule_id:id,target_production_id:p.id,target_day_id:n===1?day:null,target_phase_id:n===1?null:phase?.id??null,next_display_name:name,next_slug:'fictional-'+id,next_document:doc,schema_version:1});p.schedules.push({id,name,phase:phase?.id??null,day:n===1?day:null});
  }
  fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
 }
 console.log(JSON.stringify({organization:org,productions:productions.length,schedules:productions.reduce((n,p)=>n+p.schedules.length,0)}));
}finally{for(const c of clients)await c.auth.signOut({scope:'local'});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
