export type WorkspaceScreen = 'schedule' | 'invitations' | 'acceptance' | 'lifecycle' | 'provisioning';
export interface WorkspaceLocation { screen: WorkspaceScreen; organization: string|null; schedule?:string }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseWorkspaceLocation(search:string):WorkspaceLocation {
  const params=new URLSearchParams(search),screen=params.get('screen'),organization=params.get('org');
  return {screen:screen==='invitations'||screen==='acceptance'||screen==='lifecycle'||screen==='provisioning'?screen:'schedule',organization:organization&&uuid.test(organization)?organization:null,...(params.get('schedule')&&uuid.test(params.get('schedule')!)?{schedule:params.get('schedule')!}:{})};
}
export function workspaceHref(value:WorkspaceLocation,base:'/local-workspace'|'/review'='/local-workspace'):string {
  const params=new URLSearchParams({screen:value.screen});
  if(value.organization&&uuid.test(value.organization))params.set('org',value.organization);
  if(value.schedule&&uuid.test(value.schedule))params.set('schedule',value.schedule);
  return base+'?'+params.toString();
}
/** Epoch is account identity, never an access-token or navigation change. */
export class WorkspaceIdentity {
  actor:string|null=null;
  generation=0;
  bind(actor:string|null){if(actor && actor!==this.actor){this.actor=actor;this.generation++;return true;}return false;}
  clear(){this.actor=null;this.generation++;}
  capture(){return this.generation;}
  current(generation:number){return generation===this.generation;}
}

/** Switching retains the existing scoped draft; it never authorizes a write. */
export function workspaceOrganizationSwitch(current:WorkspaceLocation,next:WorkspaceLocation,dirty:boolean,working:boolean):'ready'|'busy'|'review'{
  if(!current.organization||current.organization===next.organization)return 'ready';
  return working?'busy':dirty?'review':'ready';
}
