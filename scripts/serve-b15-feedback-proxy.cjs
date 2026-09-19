// Candidate-only faults for allowlisted disposable fixtures. No auth changes.
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const fixture={target:'efc8579e-e920-474f-970a-1a1d0a0b33e1'};
const ids=new Set([fixture.target]),control='/private/tmp/roseland-b15-feedback-fault.json';
const log='evidence/b15-feedback/cases/network.jsonl';fs.mkdirSync('evidence/b15-feedback/cases',{recursive:true});
let held=[];const record=v=>fs.appendFileSync(log,JSON.stringify({...v,at:new Date().toISOString()})+'\n');
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const headers={'Access-Control-Allow-Origin':req.headers.origin||'http://127.0.0.1:3520','Access-Control-Allow-Headers':req.headers['access-control-request-headers']||'authorization, apikey, content-type, x-client-info, x-supabase-api-version','Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS','Access-Control-Expose-Headers':'content-range'};
 if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
 let chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);let payload={};try{payload=JSON.parse(body);}catch{}
 let mode={};try{mode=JSON.parse(fs.readFileSync(control));}catch{}
 const allowed=ids.has(payload.target_schedule_id);
 const matched=allowed&&mode.rpc&&path.endsWith('/'+mode.rpc)&&(!mode.id||payload.target_schedule_id===mode.id)&&(!mode.after||payload.after_id);
 if(matched&&!mode.repeat)fs.writeFileSync(control,JSON.stringify({mode:null}));
 const entry={path,request:payload.request_id??null,snapshot:payload.target_snapshot_id??null,operation:payload.operation??null,id:payload.target_schedule_id??null,after:payload.after_id??null,expected:payload.expected_version??null,mode:matched?mode.mode:null};
 if(payload.next_document)entry.documentHash=crypto.createHash('sha256').update(JSON.stringify(payload.next_document)).digest('hex');
 const fail=()=>{res.writeHead(503,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({message:'Controlled disposable-fixture response unavailable'}));};
 if(matched&&mode.mode==='before'){record({...entry,status:503,forwarded:false});fail();return;}
 try{
  const upstream=await fetch('http://127.0.0.1:56521'+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length','accept-encoding'].includes(k))),body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'manual'});
  const data=Buffer.from(await upstream.arrayBuffer());let result;try{result=JSON.parse(data);}catch{}
  if(allowed)record({...entry,status:upstream.status,forwarded:true,version:result?.document_version??null,count:Array.isArray(result)?result.length:null});
  if(matched&&mode.mode==='lost'){fail();return;}
  const deliver=()=>{if(res.destroyed)return;res.writeHead(upstream.status,{...headers,'Content-Type':upstream.headers.get('content-type')||'application/json'});res.end(data);};
  if(matched&&mode.mode==='hold'){held.push(deliver);fs.writeFileSync('/private/tmp/roseland-b15-feedback-held.json',JSON.stringify({held:held.length,path,id:entry.id}));return;}
  deliver();
 }catch{record({...entry,status:502});if(!res.headersSent)res.writeHead(502,headers);res.end();}
});
const timer=setInterval(()=>{let v;try{v=JSON.parse(fs.readFileSync(control));}catch{}if(v?.release){fs.writeFileSync(control,'{}');const count=held.length;held.splice(0).forEach(f=>f());fs.writeFileSync('/private/tmp/roseland-b15-feedback-held.json',JSON.stringify({held:0,released:count}));}},100);
server.listen(3519,'127.0.0.1',()=>{fs.writeFileSync('/private/tmp/roseland-b15-feedback-proxy-process.json',JSON.stringify({pid:process.pid,port:3519}),{mode:0o600});console.log('Candidate-only fixture proxy ready on 3519.');});
process.on('SIGTERM',()=>{clearInterval(timer);held.splice(0).forEach(f=>f());server.close();});
