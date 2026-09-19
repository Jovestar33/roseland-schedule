// Isolated source-backed legacy runtime. UI and function bodies are pinned legacy
// source; only the Netlify Blobs adapter is replaced with persistent fictional IO.
// This does not emulate Netlify CDN, distributed storage, or hosted credentials.
const fs=require('node:fs'),http=require('node:http'),vm=require('node:vm'),crypto=require('node:crypto');
const root='/private/tmp/roseland-parity-legacy-62eb261';
const dir='evidence/b15-parity-remediation';
const database='/private/tmp/roseland-b15-legacy-functional-store.json';
const fixture=JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-fixtures.json','utf8'));
if(fixture.project!=='roseland-b14-destination-g2')throw Error('Fictional manifest required');
let data=fs.existsSync(database)?JSON.parse(fs.readFileSync(database,'utf8')):{schedules:Object.fromEntries(fixture.fixtures.map(f=>[f.name,JSON.stringify(f.document)])),cms:{rp_cms_config:fs.readFileSync(dir+'/observed-theme.json','utf8')}};
const persist=()=>fs.writeFileSync(database,JSON.stringify(data),{mode:0o600});persist();
const blobs={connectLambda(){},getStore(name){name=typeof name==='string'?name:name.name;const rows=data[name]??(data[name]={});return{
  async get(key){return rows[key]??null;},async set(key,value){rows[key]=value;persist();},async delete(key){delete rows[key];persist();},async list(){return{blobs:Object.keys(rows).map(key=>({key}))};}
};}};
const handlers={};const proof=[];
for(const name of ['auth','load','save','library','snapshots','templates','rename-schedule','move-schedule','cms-load','view-link']){
  const source=fs.readFileSync(`${root}/netlify/functions/${name}.js`,'utf8'),mod={exports:{}};
  vm.runInNewContext('(function(require,exports,module){'+source+'\n})',{process:{env:{SCHEDULE_APP_PASSWORD:'fictional-comparison',SCHEDULE_AUTH_SECRET:'fictional-runtime-only'}},console,Buffer,URL,Date})(n=>n==='@netlify/blobs'?blobs:require(n),mod.exports,mod);
  handlers[name]=mod.exports.handler;proof.push({name,sha256:crypto.createHash('sha256').update(source).digest('hex')});
}
fs.writeFileSync(dir+'/legacy-functional-source.json',JSON.stringify({source:'62eb261',substituted:'Netlify Blobs transport only; local JSON persistence; fictional credentials',handlers:proof},null,2));
const trace=[];
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3490');
 const record={method:req.method,path:url.pathname};trace.push(record);
 res.once('finish',()=>{record.status=res.statusCode;fs.writeFileSync(dir+'/legacy-functional-trace.json',JSON.stringify(trace,null,2));});
 const name=url.pathname.split('/').pop();
 if(url.pathname.startsWith('/.netlify/functions/')){
  if(!handlers[name]){req.resume();res.writeHead(403);res.end('Outside isolated audit scope');return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4000000){res.writeHead(413);res.end();return;}}
  try{const result=await handlers[name]({httpMethod:req.method,body,headers:req.headers,queryStringParameters:Object.fromEntries(url.searchParams)});res.writeHead(result.statusCode,result.headers);res.end(result.body);}catch{res.writeHead(500);res.end('Isolated handler failed');}return;
 }
 if(url.pathname.startsWith('/api/')||url.pathname==='/__csp_report'){req.resume();res.writeHead(503);res.end('Providers intentionally disconnected in isolated legacy runtime');return;}
 const upstream=http.request({hostname:'127.0.0.1',port:3480,path:req.url,method:req.method,headers:req.headers},r=>{
   const headers={...r.headers};if(headers.location){const location=new URL(headers.location,url);if(!['localhost','127.0.0.1'].includes(location.hostname)){res.writeHead(502);res.end();r.resume();return;}location.host=url.host;headers.location=location.href;}
   res.writeHead(r.statusCode,{...headers,'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; report-uri /__csp_report"});r.pipe(res);
 });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
}).listen(3490,'127.0.0.1',()=>console.log('Source-backed fictional legacy runtime on http://127.0.0.1:3490'));
