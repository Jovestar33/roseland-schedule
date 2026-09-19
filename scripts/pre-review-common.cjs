const fs=require('node:fs');
const {createClient}=require('@supabase/supabase-js');
const {createHmac}=require('node:crypto');
const config=JSON.parse(fs.readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json'));
const fixtures=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-overnight-fixtures.json'));
if(config.API_URL!=='http://127.0.0.1:56521'||fixtures.project!=='roseland-b14-destination-g2')throw Error('Owned fictional loopback required');
function totp(secret){let bits='';for(const c of secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2))),n=Buffer.alloc(8);n.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(n).digest(),o=h.at(-1)&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function login(account){const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url??input.href);if(u.origin!==config.API_URL)throw Error('Nonlocal request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}});if((await c.auth.signInWithPassword({email:account.email,password:account.password})).error)throw Error('Existing account sign-in failed');if(account.factor&&(await c.auth.mfa.challengeAndVerify({factorId:account.factor.id,code:totp(account.factor.secret)})).error)throw Error('Existing MFA challenge failed');return c;}
async function rpc(c,name,args){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+r.error.code+' '+r.error.message);return r.data;}
function save(name,value){fs.writeFileSync('evidence/pre-review/'+name+'.json',JSON.stringify(value,null,2)+'\n');}
module.exports={fs,fixtures,login,rpc,save};
