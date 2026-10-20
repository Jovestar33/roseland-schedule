const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkHostedInventory}=require('../../scripts/trial-sync/hosted.cjs');
const binding={integrationId:'integration',organizationId:'org',netlifySiteId:'site',legacyOrigin:'https://fictional.netlify.app'};
test('hosted discovery binds both sources and records new schedule attention',async()=>{
 const result=await checkHostedInventory({...binding,bridge:async body=>{assert.deepEqual(body,{operation:'inventory',store:'schedules'});return{siteId:'site',store:'schedules',keys:['existing','new']};},rpc:async(name,args)=>{assert.equal(name,'record_trial_sync_inventory');assert.equal(args.expected_organization_id,'org');assert.equal(args.expected_site_id,'site');assert.equal(args.expected_origin,binding.legacyOrigin);assert.deepEqual(args.legacy_keys,['existing','new']);return{attention:1};}});assert.equal(result,1);
});
test('invalid discovery cannot overwrite the last verified inventory',async()=>{
 for(const value of [{siteId:'other',store:'schedules',keys:[]},{siteId:'site',store:'other',keys:[]},{siteId:'site',store:'schedules',keys:['duplicate','duplicate']},{siteId:'site',store:'schedules',keys:[null]}]){
 let calls=0;await assert.rejects(checkHostedInventory({...binding,bridge:async()=>value,rpc:async()=>{calls++;}}),e=>e.code==='INVALID_INVENTORY');assert.equal(calls,0);
 }
});
