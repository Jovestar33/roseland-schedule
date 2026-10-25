import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationLogo} from '../../lib/branding.ts';

test('Logo selection follows the requested background and preserves the shared custom logo',()=>{
 const cfg={logo:'shared',logoOnLight:'light',logoOnDark:'dark'};
 assert.equal(organizationLogo(cfg,'light'),'light');
 assert.equal(organizationLogo(cfg,'dark'),'dark');
 assert.equal(organizationLogo({logo:'shared'},'light'),'shared');
 assert.equal(organizationLogo({logo:'shared'},'dark'),'shared');
 assert.equal(organizationLogo({...cfg,logoOnLight:null},'light'),'shared');
 assert.equal(organizationLogo({logoOnLight:'light'},'dark'),'/logo-header.png');
 assert.deepEqual(cfg,{logo:'shared',logoOnLight:'light',logoOnDark:'dark'});
});
test('Default light logo is suitable for paper, including older copied default settings',()=>{
 assert.equal(organizationLogo({},'light'),'/logo-call-sheet.png');
 assert.equal(organizationLogo({},'dark'),'/logo-header.png');
 assert.equal(organizationLogo({logo:'/logo-header.png'},'light'),'/logo-call-sheet.png');
 assert.equal(organizationLogo({logo:null,logoOnDark:null},'dark'),'/logo-header.png');
 assert.equal(organizationLogo({},'light','custom-default'),'custom-default');
});
