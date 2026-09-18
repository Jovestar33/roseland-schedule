'use client';
import { createContext, useContext, useEffect } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type {OrganizationLifecycle} from '@/lib/platform/organization-lifecycle';
import type { WorkspaceOrganization } from '@/lib/platform/workspace-repository';
export interface WorkspacePanelState { dirty:boolean; busy:boolean }
export interface WorkspaceScheduleRequest {id:string;organization:string;sequence:number;target?:'lifecycle'}
export interface WorkspacePanel {
  client:SupabaseClient;
  session:Session|null;
  authNeeded:boolean;
  organization:WorkspaceOrganization|null;
  active:boolean;
  readOnly?:boolean;
  lifecycleVersion?:number;
  lifecycleRevision?:number;
  onLifecycleChange?:(state:OrganizationLifecycle)=>void;
  panelId:string;
  report:(id:string,state:WorkspacePanelState|null)=>void;
  requireAuth:()=>void;
  openOrganization:(id:string)=>void;
  openLifecycle?:(organization:string,id:string)=>void;
  openSchedule:(organization:string,id:string)=>void;
  scheduleRequest:WorkspaceScheduleRequest|null;
  consumeScheduleRequest:(sequence:number)=>void;
}
export const LocalWorkspaceContext=createContext<WorkspacePanel|null>(null);
export const useLocalWorkspace=()=>useContext(LocalWorkspaceContext);
export function useWorkspacePanelState(dirty:boolean,busy:boolean){
  const workspace=useLocalWorkspace(),report=workspace?.report,id=workspace?.panelId;
  useEffect(()=>{if(report&&id)report(id,{dirty,busy});},[report,id,dirty,busy]);
  useEffect(()=>()=>{if(report&&id)report(id,null);},[report,id]);
}
