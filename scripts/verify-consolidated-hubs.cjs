const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root='evidence/consolidated-hubs/';
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_roseland-b14-destination-g2','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:q,encoding:'utf8'});
const baseline=JSON.parse(fs.readFileSync(root+'preservation-baseline.json'));
const rows=JSON.parse(sql("select jsonb_agg(t) from (select 'schedules' as kind,id::text as id,md5(to_jsonb(s)::text) as hash from public.schedules s union all select 'productions',id::text,md5(to_jsonb(p)::text) from public.productions p union all select 'phases',id::text,md5(to_jsonb(p)::text) from public.phases p union all select 'organization_memberships',organization_id||':'||user_id,md5(to_jsonb(m)::text) from public.organization_memberships m union all select 'production_memberships',id::text,md5(to_jsonb(m)::text) from public.production_memberships m)t;"));
for(const before of baseline.rows)assert.deepEqual(rows.find(r=>r.kind===before.kind&&r.id===before.id),before);
const counts=Object.fromEntries([...new Set(baseline.rows.map(r=>r.kind))].map(kind=>[kind,baseline.rows.filter(r=>r.kind===kind).length]));
const result={checkedAt:new Date().toISOString(),originalRowsExactlyUnchanged:counts,newRows:rows.length-baseline.rows.length};
fs.writeFileSync(root+'preservation-final.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
