'use client';
import { createContext, useContext } from 'react';
// Opt-in only: ordinary Netlify editor behaviour stays unchanged.
export const LocalEditorContext = createContext(false);
export const useLocalEditor = () => useContext(LocalEditorContext);
