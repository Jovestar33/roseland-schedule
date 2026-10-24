'use client';
import {createContext,useContext} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {StoredSchedule} from '@/lib/platform/schedule-repository';
export interface CallSheetPublishingAccess {client:SupabaseClient;actor:string|null;schedule:string|null;enabled:boolean;getSource:()=>StoredSchedule|null;hasDraft:()=>boolean}
export const CallSheetPublishingContext=createContext<CallSheetPublishingAccess|null>(null);
export const useCallSheetPublishing=()=>useContext(CallSheetPublishingContext);
