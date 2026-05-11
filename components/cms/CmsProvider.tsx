'use client';
import { useEffect } from 'react';
import { useCmsStore } from '@/lib/store/cmsStore';
import CmsModal from './CmsModal';

export default function CmsProvider({ children }: { children: React.ReactNode }) {
  const loadConfig = useCmsStore(s => s.loadConfig);
  const modalOpen  = useCmsStore(s => s.modalOpen);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <>
      {children}
      {modalOpen && <CmsModal />}
    </>
  );
}
