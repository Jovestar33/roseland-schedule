import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePresentation,validatePresentation} from '../../lib/platform/organization-presentation.ts';
const id='11111111-1111-4111-8111-111111111111';
test('Organization appearance preserves supported complete configuration and captures immutable requests',()=>{const cfg={actions:[{name:'Scene',color:'aShoot'}],labels:{colAction:'Activity'},colors:{'--pink':'#123456'},actionStyles:{aShoot:{bg:'#ffffff',text:'#111111'}},logo:null};assert.deepEqual(validatePresentation(cfg),cfg);const a=capturePresentation({actor:id,organization:id,request:id,version:0,config:cfg});cfg.actions[0].name='Newer';assert.equal(a.config.actions![0].name,'Scene');assert.ok(Object.isFrozen(a.config.actions));});
test('Organization appearance rejects arbitrary CSS, external logos, unknown fields and duplicate or reserved actions',()=>{for(const value of [{unknown:true},{colors:{'--pink':'red;display:none'}},{colors:{'--unapproved':'#112233'}},{actionStyles:{aShoot:{bg:'#123456',text:'url(x)'}}},{labels:{colAction:'bad\nlabel'}},{actions:[{name:'Other',color:''}]},{actions:[{name:'One',color:''},{name:'one',color:''}]},{logo:'https://example.test/logo.png'},{logo:'data:text/html;base64,SGk='}])assert.throws(()=>validatePresentation(value));});

test('Organization logos retain the shared fallback and accept independent light and dark versions',()=>{
 const cfg={logo:'data:image/png;base64,U2hhcmVk',logoOnLight:'data:image/jpeg;base64,TGlnaHQ=',logoOnDark:'data:image/webp;base64,RGFyaw=='};
 assert.deepEqual(validatePresentation(cfg),cfg);
 const a=capturePresentation({actor:id,organization:id,request:id,version:4,config:cfg});
 cfg.logoOnLight='data:image/png;base64,TmV3';
 assert.equal(a.config.logoOnLight,'data:image/jpeg;base64,TGlnaHQ=');
 assert.ok(Object.isFrozen(a.config));
 assert.deepEqual(validatePresentation({logoOnLight:null,logoOnDark:null}),{logoOnLight:null,logoOnDark:null});
});
test('Each organization logo uses the same allowed format and shared payload limits',()=>{
 for(const key of ['logo','logoOnLight','logoOnDark'])for(const value of ['https://example.test/logo.png','data:text/html;base64,SGk=','/logo-header.png',true,{},'data:image/png;base64,'+'A'.repeat(2800000)])assert.throws(()=>validatePresentation({[key]:value}));
 assert.throws(()=>validatePresentation({logoOnLight:'data:image/png;base64,'+'A'.repeat(1600000),logoOnDark:'data:image/png;base64,'+'A'.repeat(1600000)}));
});
