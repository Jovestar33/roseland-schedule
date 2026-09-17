// Fictional local browser harness. No hosted requests, credentials or payloads
// are logged. Commands inject response loss only after the local server replies.
import {createServer,request} from 'node:http';
import {documentFixture} from '../tests/fixtures/document-fixtures.ts';
import {createInterface} from 'node:readline';
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
const tracePath='evidence/production-templates/browser-request-trace.json';
mkdirSync('evidence/production-templates',{recursive:true});
const trace:{surface:string;method:string;path:string;status:number;effect?:string}[]=existsSync(tracePath)?JSON.parse(readFileSync(tracePath,'utf8')):[];
let nextDrop='',nextHold='';const held:(()=>void)[]=[];
const flush=()=>writeFileSync(tracePath,JSON.stringify(trace,null,2)+'\n');
const servers=[3425,3426].map(port=>createServer((req,res)=>{
 const api=port===3426,u=new URL(req.url??'/',`http://127.0.0.1:${port}`);
 const entry={surface:api?'fictional API':'local app',method:req.method??'GET',path:u.pathname,status:0,effect:undefined as string|undefined};trace.push(entry);res.on('finish',flush);
 if(!api&&req.method==='GET'&&u.pathname==='/__fictional_browser_templates'){
  const d=documentFixture(2),fixture=JSON.stringify({'Fictional browser storage original':{rows:d.rows,savedAt:d.savedAt}});
  entry.status=200;res.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"});
  res.end(`<!doctype html><title>Fictional browser-template fixture</title><h1>Fictional browser-template fixture</h1><p>This isolated loopback origin only. Existing browser data is never overwritten.</p><button id="seed">Seed fictional templates if empty</button><button id="check">Check original unchanged</button><p id="status" role="status"></p><a href="/local-workspace">Return to local workspace</a><script>const raw=${JSON.stringify(fixture)},key='rp_tpls',status=document.getElementById('status');document.getElementById('seed').onclick=()=>{if(localStorage.getItem(key)!==null){status.textContent='Existing source retained; nothing written.';return;}localStorage.setItem(key,raw);status.textContent='Fictional source seeded.';};document.getElementById('check').onclick=()=>status.textContent=localStorage.getItem(key)===raw?'Original source is byte-for-byte unchanged.':'Source differs or has not been seeded.';</script>`);return;
 }
 if(u.pathname==='/__csp_report'){entry.status=204;entry.effect='external request blocked';req.resume();res.writeHead(204);res.end();return;}
 if(!api&&(u.pathname.startsWith('/.netlify/')||u.pathname.startsWith('/api/places')||u.pathname.includes('weather'))){entry.status=502;entry.effect='unexpected provider blocked';req.resume();res.writeHead(502);res.end('Provider request refused');return;}
 const drop=api&&req.method==='POST'&&nextDrop&&u.pathname.endsWith('/'+nextDrop),hold=api&&req.method==='POST'&&nextHold&&u.pathname.endsWith('/'+nextHold);if(drop)nextDrop='';if(hold)nextHold='';
 const upstream=request({hostname:'127.0.0.1',port:api?55621:3424,path:req.url,method:req.method,headers:{...req.headers,'accept-encoding':'identity'}},r=>{
  const headers={...r.headers};delete headers['content-length'];delete headers['content-encoding'];delete headers.etag;
  if(headers.location&&!['127.0.0.1','localhost'].includes(new URL(headers.location,u).hostname)){r.resume();entry.status=502;entry.effect='non-local redirect blocked';res.writeHead(502);res.end();return;}
  if(api){headers['access-control-allow-origin']='http://127.0.0.1:3425';headers['access-control-allow-headers']='authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile,range,range-unit,x-upsert';headers['access-control-allow-methods']='GET,POST,PATCH,DELETE,OPTIONS';}
  const chunks:Buffer[]=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{
   const deliver=()=>{if(res.destroyed)return;entry.status=drop?502:r.statusCode??502;res.writeHead(entry.status,drop?{'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:3425'}:{...headers,...(!api?{'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:3426; report-uri /__csp_report"}:{})});const body=Buffer.concat(chunks);res.end(drop?JSON.stringify({error:'Fictional response-loss test'}):!api&&/javascript|json|text/.test(String(headers['content-type']))?body.toString().replaceAll('http://127.0.0.1:55621','http://127.0.0.1:3426'):body);};
   if(hold){entry.effect='held local response';held.push(deliver);flush();}else{if(drop)entry.effect='lost local response after server result';deliver();}
  });
 });upstream.on('error',()=>{entry.status=502;res.writeHead(502);res.end('Local service unavailable');});req.pipe(upstream);
}).listen(port,'127.0.0.1'));
const input=createInterface({input:process.stdin});input.on('line',line=>{const [command,rpc]=line.trim().split(' ');if(command==='drop')nextDrop=rpc;if(command==='hold')nextHold=rpc;if(command==='release')while(held.length)held.shift()!();if(command==='trace'||command==='stop'){flush();console.log(JSON.stringify({requests:trace.length,held:held.length,blocked:trace.filter(x=>x.effect?.includes('blocked')).length}));}if(command==='stop'){for(const s of servers)s.close();input.close();}});
console.log('Fictional template UI: http://127.0.0.1:3425/local-workspace');
