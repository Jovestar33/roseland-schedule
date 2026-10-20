'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

// Read-only planning: never shells out, connects to a database, or applies SQL.
function migrationPlan(directory,applied){
  if(!Array.isArray(applied))throw new Error('Expected a verified migration ledger array');
  const files=fs.readdirSync(directory).filter(name=>name.endsWith('.sql')).sort();
  const sources=files.map(file=>{
    const match=/^(\d{14})_(.+)\.sql$/.exec(file);
    if(!match)throw new Error('Unexpected migration filename');
    const bytes=fs.readFileSync(path.join(directory,file));
    return {version:match[1],name:match[2],file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  });
  const versions=new Set(sources.map(row=>row.version));
  if(versions.size!==sources.length)throw new Error('Duplicate source migration version');
  const seen=new Set();
  for(const row of applied){
    if(!row||typeof row.version!=='string'||typeof row.name!=='string'||seen.has(row.version))throw new Error('Invalid or duplicate applied migration');
    const source=sources.find(source=>source.version===row.version);
    if(!source||source.name!==row.name)throw new Error('Applied history does not match this checkout');
    seen.add(row.version);
  }
  const lastApplied=Array.from(seen).sort().at(-1);
  const pending=sources.filter(source=>!seen.has(source.version));
  if(lastApplied&&pending.some(source=>source.version<lastApplied))throw new Error('History gap requires reconciliation before applying migrations');
  return {format:1,readOnly:true,appliedCount:applied.length,pendingCount:pending.length,
    sourceChecksumsOnly:true,pending};
}
module.exports={migrationPlan};
if(require.main===module){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node scripts/hosting/migration-plan.cjs VERIFIED_LEDGER.json');
    const ledger=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(migrationPlan(path.resolve(__dirname,'../../supabase/migrations'),ledger),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
