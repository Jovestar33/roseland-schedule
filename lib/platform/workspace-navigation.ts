export type WorkspaceScreen = 'schedule' | 'invitations' | 'acceptance';
export interface WorkspaceLocation { screen: WorkspaceScreen; organization: string|null }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseWorkspaceLocation(search:string):WorkspaceLocation {
  const params=new URLSearchParams(search),screen=params.get('screen'),organization=params.get('org');
  return {screen:screen==='invitations'||screen==='acceptance'?screen:'schedule',organization:organization&&uuid.test(organization)?organization:null};
}
export function workspaceHref(value:WorkspaceLocation):string {
  const params=new URLSearchParams({screen:value.screen});
  if(value.organization&&uuid.test(value.organization))params.set('org',value.organization);
  return '/local-workspace?'+params.toString();
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
