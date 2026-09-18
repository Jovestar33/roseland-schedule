import {createHmac,timingSafeEqual} from 'node:crypto';

/** Legacy editor credential: the UI flag cookie is never authentication. */
export function placesEditorAuthorized(authorization:string|null,env:NodeJS.ProcessEnv):boolean {
 const supplied=authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 const password=env.SCHEDULE_APP_PASSWORD,secret=env.SCHEDULE_AUTH_SECRET;
 if(!supplied||!password||!secret)return false;
 const expected=createHmac('sha256',secret).update(`editor:${password}`).digest();
 return timingSafeEqual(Buffer.from(supplied,'hex'),expected);
}

/** Bounds each process. Distributed/provider quotas remain a deployment gate. */
export function createPlacesBudget(limit=240,windowMs=60000){
 let start=0,hits=0;
 return(now=Date.now())=>{if(now-start>=windowMs||now<start){start=now;hits=0;}return ++hits<=limit;};
}
