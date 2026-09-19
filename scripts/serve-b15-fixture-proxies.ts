// Visible browser harness only. Both targets are loopback; legacy reads use
// fictional fixture responses and every legacy mutation except fake login fails.
import { createServer, request } from 'node:http';
import { createInterface } from 'node:readline';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { documentFixture, emptyDocumentFixture } from '../tests/fixtures/document-fixtures.ts';
const data:Record<string,unknown>={'B15 ordinary fictional day':documentFixture(),'B15 long fictional day':documentFixture(32),'B15 empty fictional day':emptyDocumentFixture()};
const tracePath='evidence/b15-review/browser-request-trace.json';
const trace:{surface:string;method:string;path:string;result:string}[]=existsSync(tracePath)?JSON.parse(readFileSync(tracePath,'utf8')):[];
const servers=[3481,3486].map(port=>createServer((req,res)=>{
 const u=new URL(req.url??'/',`http://127.0.0.1:${port}`),legacy=port===3481;
 const record={surface:legacy?'fictional legacy':'authenticated local',method:req.method??'GET',path:u.pathname,result:'local application'};trace.push(record);res.once('finish',()=>writeFileSync(tracePath,JSON.stringify(trace,null,2)));
 const json=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 if(u.pathname==='/__csp_report'){record.result='blocked external request';req.resume();res.writeHead(204);res.end();return;}
 if(u.pathname.startsWith('/.netlify/')||u.pathname.startsWith('/api/places')||u.pathname.includes('weather')){
  record.result=legacy?'fictional fixture':'unexpected legacy request blocked';
  if(!legacy){req.resume();json(502,{error:'Local target must not call legacy providers'});return;}
  if(u.pathname==='/.netlify/functions/auth'&&req.method==='POST'){req.resume();json(200,{ok:true,token:'fictional-local-comparison-only'});return;}
  if(req.method!=='GET'){req.resume();json(405,{error:'Read-only fictional baseline'});return;}
  const name=u.searchParams.get('name');
  if(u.pathname==='/.netlify/functions/load'){json(200,name?(data[name]??null):{schedules:Object.keys(data)});return;}
  if(u.pathname==='/.netlify/functions/library'){json(200,{library:{version:1,folders:[],scheduleFolderMap:{},updatedAt:1720000000000}});return;}
  if(u.pathname==='/.netlify/functions/templates'){json(200,{templates:{}});return;}
  if(u.pathname==='/.netlify/functions/cms-load'){json(200,{});return;}
  if(u.pathname.includes('snapshots')){json(200,{snapshots:[]});return;}
  json(200,{});return;
 }
 const upstream=request({hostname:'127.0.0.1',port:legacy?3480:3485,path:req.url,method:req.method,headers:req.headers},r=>{
  const headers={...r.headers};
  if(headers.location){const location=new URL(headers.location,u);if(!['127.0.0.1','localhost'].includes(location.hostname)){record.result='non-local redirect blocked';r.resume();json(502,{error:'Non-local redirect refused'});return;}location.host=u.host;headers.location=location.href;}
  res.writeHead(r.statusCode??502,{...headers,'content-security-policy':`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${legacy?'':' http://127.0.0.1:56521'}; report-uri /__csp_report`});r.pipe(res);
 });upstream.on('error',()=>{res.writeHead(502);res.end('Local app unavailable');});req.pipe(upstream);
}).listen(port,'127.0.0.1'));
console.log('Fictional legacy: http://127.0.0.1:3481/ ; authenticated target: http://127.0.0.1:3486/local-workspace');
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line==='trace'||line==='stop'){writeFileSync('evidence/b15-review/browser-request-trace.json',JSON.stringify(trace,null,2));console.log('TRACE '+JSON.stringify({requests:trace.length,unexpected:trace.filter(r=>r.result.includes('blocked')).length}));}if(line==='stop'){for(const server of servers)server.close();input.close();}});
