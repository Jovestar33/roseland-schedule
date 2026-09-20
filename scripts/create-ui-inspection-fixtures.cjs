// Fictional inspection copies only; existing schedules and memberships are read-only.
const {randomUUID}=require('node:crypto');
const {fs,login,rpc}=require('./pre-review-common.cjs');
(async()=>{
 const path='evidence/ui-experience/inspection-fixtures.json';
 if(fs.existsSync(path))throw Error('Manifest already exists; do not duplicate fixture creation.');
 const baseline=JSON.parse(fs.readFileSync('evidence/ui-experience/preservation-baseline.json'));
 const source=baseline.rows.find(x=>x.id==='5ba74f3b-690d-42e2-9723-5476bca97f8a');
 const client=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));
 const copies=[];
 try{for(const kind of ['keyboard','oversized']){
  const id=randomUUID(),document=structuredClone(source.document);
  if(kind==='oversized'){
   document.rows=document.rows.filter(r=>!r.sunLocked).slice(0,1);
   Object.assign(document.rows[0],{contactName:'Zoë — Fictional Continuation',contactTitle:'Fictional café team / 照明',contactPhone:'',contactEmail:'long.fictional.contact@example.test',desc:Array.from({length:70},(_,i)=>`CONT-${i+1} Fictional continuation text — café, long assignment details remain readable on the following page. END-CONT-${i+1}`).join('\n')});
  }
  const name='UI refinement '+kind+' — fictional';
  await rpc(client,'create_schedule_in_production',{target_schedule_id:id,target_production_id:source.production_id,target_day_id:null,target_phase_id:null,next_display_name:name,next_slug:'ui-refinement-'+id,next_document:document,schema_version:1});
  copies.push(await rpc(client,'session_read_schedule',{target_schedule_id:id}));
  fs.writeFileSync(path,JSON.stringify(copies,null,2));
 }
 console.log('Created two isolated fictional inspection copies.');
 }finally{await client.auth.signOut({scope:'local'});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
