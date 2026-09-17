'use client';
import { createContext, useContext } from 'react';
import type { DocumentProviders } from '@/lib/platform/document-providers';
export const DocumentProvidersContext = createContext<DocumentProviders | null>(null);
export const useDocumentProviders = () => useContext(DocumentProvidersContext);
