import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Fictional loopback required');
const summaries=[];
for(const path of ['/private/tmp/roseland-b15-review-access.json','/private/tmp/roseland-b15-entry-review-access.json']){
 const access=JSON.parse(readFileSync(path,'utf8'));
 const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await client.auth.signInWithPassword({email:access.email,password:access.password});if(login.error)throw Error('Login failed');
 const result=await client.rpc('list_my_organization_access',{after_id:null,target_organization_id:null});if(result.error)throw Error('Membership read failed');
 summaries.push({accessFile:path,organizations:result.data});
}
writeFileSync('evidence/b15-workflow-completion/organization-access.json',JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries));
