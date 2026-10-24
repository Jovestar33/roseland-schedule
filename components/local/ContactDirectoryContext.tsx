'use client';
import {createContext,useContext} from 'react';
import type {createContactDirectoryRepository} from '@/lib/platform/contact-directory';
export interface ContactDirectoryAccess {actor:string;schedule:string;repository:ReturnType<typeof createContactDirectoryRepository>;current:()=>boolean}
export const ContactDirectoryContext=createContext<ContactDirectoryAccess|null>(null);
export const useContactDirectory=()=>useContext(ContactDirectoryContext);
