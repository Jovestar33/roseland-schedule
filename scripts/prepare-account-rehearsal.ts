// Prepare a NEW fictional B08 database directory. Does not start, reset, link,
// stop or modify any existing Supabase project. Run from the dev checkout.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
const args=process.argv.slice(2),at=args.indexOf('--workdir'),pi=args.indexOf('--port-base');
if(at<0||pi<0||!args[at+1]||!args[pi+1])throw new Error('Supply --workdir /private/tmp/roseland-b08-NAME --port-base 56520');
const destination=resolve(args[at+1]),name=basename(destination),base=Number(args[pi+1]);
if(!destination.startsWith('/private/tmp/')||!/^roseland-b08-[a-z0-9-]+$/.test(name)||existsSync(destination))throw new Error('A new named B08 directory under /private/tmp is required');
if(!Number.isInteger(base)||base<1024||base>65520)throw new Error('Choose a free local port base');
let config=readFileSync('supabase/config.toml','utf8').replace(/^project_id\s*=.*$/m,`project_id = "${name}"`);
for(const offset of [0,1,2,3,4,7,9])config=config.replaceAll(String(54320+offset),String(base+offset));
function change(section:string,key:string,value:string){
 const head=`[${section}]`,start=config.indexOf(head+'\n');if(start<0)throw new Error('Missing local config section');
 const end=config.indexOf('\n[',start+head.length),stop=end<0?config.length:end;
 const block=config.slice(start,stop),pattern=new RegExp(`^${key}\\s*=.*$`,'m');
 if(!pattern.test(block))throw new Error('Missing local config setting');
 config=config.slice(0,start)+block.replace(pattern,`${key} = ${value}`)+config.slice(stop);
}
change('auth','enable_signup','false');change('auth.email','enable_signup','true');change('auth.email','enable_confirmations','true');
change('auth','site_url','"http://127.0.0.1:3435/local-workspace"');
change('auth','additional_redirect_urls','["http://127.0.0.1:3435/local-workspace"]');
config+='\n[auth.email.template.invite]\nsubject = "Fictional local account verification"\ncontent_path = "./supabase/account-templates/invite.html"\n\n[auth.email.template.recovery]\nsubject = "Fictional local password recovery"\ncontent_path = "./supabase/account-templates/recovery.html"\n';
mkdirSync(destination+'/supabase',{recursive:true});
for(const folder of ['migrations','tests','account-templates'])cpSync('supabase/'+folder,destination+'/supabase/'+folder,{recursive:true});
writeFileSync(destination+'/supabase/config.toml',config);
writeFileSync(destination+'/supabase/seed.sql','-- Fictional B08 project. Runtime suite explicitly enables account policy enforcement.\n');
console.log(`Prepared ${name} on local ports ${base}–${base+9}. Existing projects untouched. Start it explicitly, then run DB and account runtime acceptance.`);
