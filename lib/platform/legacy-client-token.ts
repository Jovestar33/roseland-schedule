import {createHmac,timingSafeEqual} from 'node:crypto';
export function legacyClientExpiry(name:unknown,token:unknown,secret:unknown,now=Math.floor(Date.now()/1000)):number|null{
 if(typeof name!=='string'||!name||name.length>200||typeof token!=='string'||typeof secret!=='string'||secret.length<32)return null;
 const match=/^(\d{10})\.([a-f0-9]{64})$/.exec(token);if(!match)return null;
 const expires=Number(match[1]);if(expires<=now||expires>now+30*86400)return null;
 const expected=createHmac('sha256',secret).update(`schedule-view:v2:${name}:${expires}`).digest();
 return timingSafeEqual(Buffer.from(match[2],'hex'),expected)?expires:null;
}
