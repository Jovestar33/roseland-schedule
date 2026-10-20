const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildPlan}=require('../../scripts/migration/live-plan.cjs');
const {SITE,ORIGIN}=require('../../scripts/trial-sync/capture-command.cjs');
function fixture(){
 const doc={meta:{projectName:'Film',phase:'Hub',date:'2026-10-22'},rows:[{action:'Shoot',cast:'  A\nB  ',timeIn:'9:00 AM',dur:'00:20'}],savedAt:1};
 const names=['Town – Draft','Town Draft'];const objects=names.map(key=>({store:'schedules',key,value:structuredClone(doc),sha256:'0'.repeat(64),etag:'a',raw_base64:'e30=',length:2}));
 objects.push({store:'schedule-library',key:'rp_library_index_v1',value:{folders:[],tsarchived:[names[1]],phaseOrder:{film:{hub:[names[1],names[0]]}}}},{store:'production-index',key:'rp_production_v1',value:{productions:[],days:[]}},{store:'cms',key:'rp_cms_config',value:{colors:{'--black':'#111'}}},{store:'schedule-templates',key:'templates',value:{Template:{rows:doc.rows,savedAt:1}}});
 const snap={id:'same',label:'Saved',savedAt:1,data:doc};for(const name of [names[0],'Deleted town'])objects.push({store:'schedule-snapshots',key:'snapshots_'+crypto.createHash('sha256').update(name).digest('hex'),value:{name,snapshots:[snap,snap],updatedAt:1}});
 return {manifest:{siteId:SITE,origin:ORIGIN,sha256:'1'.repeat(64)},objects};
}
test('live plan preserves distinct drafts, duplicate snapshots and absent-schedule history',()=>{const f=fixture(),before=structuredClone(f),p=buildPlan(f.manifest,f.objects);assert.deepEqual(f,before);assert.equal(p.schedules.length,2);assert.equal(p.schedules[0].status,'archived');assert.equal(new Set(p.schedules.map(s=>s.slug)).size,2);assert.equal(p.schedules[0].document.rows[0].cast,'  A\nB  ');assert.equal(p.related.length,2);assert.equal(new Set(p.related.map(s=>s.id)).size,2);assert.equal(p.unattached_snapshots[0].count,2);assert.equal(p.presentation.colors['--black'],'#111111');assert.deepEqual(buildPlan(f.manifest,f.objects),p);});
test('planner refuses unexpected document fields, wrong source and ambiguous production placement',()=>{const f=fixture();assert.throws(()=>buildPlan({...f.manifest,siteId:'other'},f.objects));f.objects[0].value.rows[0].unknown='cannot strip';assert.throws(()=>buildPlan(f.manifest,f.objects),/Unrecognized/);delete f.objects[0].value.rows[0].unknown;f.objects[0].value.meta.projectName='';assert.throws(()=>buildPlan(f.manifest,f.objects),/Explicit/);});
test('shared template assignment refuses ambiguity rather than inventing source ownership',()=>{const f=fixture();f.objects[0].value.meta.projectName='Other film';assert.throws(()=>buildPlan(f.manifest,f.objects),/Shared template production/);});

test('pre-import live verification rejects changed source bytes, ETags, metadata and inventories',async()=>{
 const {verifyLive}=require('../../scripts/migration/verify-live-source.cjs'),{hash}=require('../../scripts/trial-sync/core.cjs'),{stores}=require('../../scripts/trial-sync/capture-live.cjs');
 const bytes=Buffer.from('{}'),obj={store:'schedules',key:'Town',etag:'v1',metadata:{savedAt:1},length:2,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 const p={format:'roseland.live-trial-import.v1',site_id:SITE,origin:ORIGIN,objects:[obj],capture_manifest:{inventory:Object.fromEntries(stores.map(s=>[s,s==='schedules'?['Town']:[]]))}};p.sha256=hash(p);
 let mode='ok',writes=0;
 const bridge=async b=>{assert.ok(['raw','inventory'].includes(b.operation));if(b.operation==='inventory')return{siteId:SITE,store:b.store,keys:mode==='inventory'?['unexpected']:p.capture_manifest.inventory[b.store]};return{siteId:SITE,store:b.store,key:b.key,etag:mode==='etag'?'v2':'v1',metadata:mode==='metadata'?{}:obj.metadata,bytes:mode==='bytes'?Buffer.from('[]').toString('base64'):bytes.toString('base64')};};
 assert.equal((await verifyLive(p,bridge)).verified,true);
 for(mode of ['etag','metadata','bytes','inventory'])await assert.rejects(verifyLive(p,bridge),/changed/);
 assert.equal(writes,0);
});
