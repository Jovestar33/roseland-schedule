'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCmsStore } from '@/lib/store/cmsStore';
import CmsModal from './CmsModal';

export default function CmsProvider({ children }: { children: React.ReactNode }) {
  const isLocal = usePathname() === '/local-schedule';
  const loadConfig = useCmsStore(s => s.loadConfig);
  const modalOpen  = useCmsStore(s => s.modalOpen);

  useEffect(() => {
    if (!isLocal) loadConfig();
  }, [loadConfig, isLocal]);

  return (
    <>
      {children}
      {!isLocal && modalOpen && <CmsModal />}
    </>
  );
}
