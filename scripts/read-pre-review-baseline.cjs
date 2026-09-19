const assert=require('node:assert/strict');
const {fs,fixtures,login,rpc,save}=require('./pre-review-common.cjs');
(async()=>{if(fs.existsSync('evidence/pre-review/baseline.json'))throw Error('Preservation baseline already exists; use verify-pre-review-preservation.cjs');const clients=[];try{
 const review=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));clients.push(review);
 const old=JSON.parse(fs.readFileSync('evidence/b15-document/cases/library-downloaded.json')).schedules;
 const ids=[...old.map(x=>x.source.id),'efc8579e-e920-474f-970a-1a1d0a0b33e1','1d6d6e80-3867-45d2-98d2-0ec936985320'];
 const records=[];for(const id of ids)records.push(await rpc(review,'session_read_schedule',{target_schedule_id:id}));
 for(const entry of old){const r=records.find(x=>x.id===entry.source.id);assert.equal(r.document_version,entry.source.version);assert.equal(r.display_name,entry.name);assert.deepEqual(r.document,entry.data);}
 const admin=await login(fixtures.leadership);clients.push(admin);const member=await login(fixtures.member);clients.push(member);
 const directory=[],tables={};for(const org of fixtures.organizations)directory.push({organization:org.id,directory:await rpc(admin,'schedule_permission_directory',{target_organization_id:org.id})});
 for(const table of ['organization_memberships','production_memberships','productions','schedules']){const r=await admin.from(table).select('*').in('organization_id',fixtures.organizations.map(x=>x.id)).order(table==='organization_memberships'?'user_id':'id');if(r.error)throw Error(table+': '+r.error.message);tables[table]=r.data;}
 tables.permissions=[];for(const org of fixtures.organizations)tables.permissions.push({organization:org.id,data:await rpc(admin,'read_schedule_permissions',{target_organization_id:org.id,target_production_id:org.production,target_schedule_id:null})});
 const capabilities=[];for(const org of fixtures.organizations){const actions={};for(const action of ['read','edit','export','transfer','permissions'])actions[action]=await rpc(member,'schedule_capability',{action,target_production_id:org.production,target_schedule_id:org.schedule});capabilities.push({organization:org.id,actions});}
 save('baseline',{capturedAt:new Date().toISOString(),retainedReviewSchedules:records,existingNorthSouth:tables,directory,memberCapabilities:capabilities});
 console.log(JSON.stringify({reviewSchedules:records.length,existingNorthSouthCounts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),memberCapabilities:capabilities}));
}finally{for(const c of clients)await c.auth.signOut({scope:'local'});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
