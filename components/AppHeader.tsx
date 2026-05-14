'use client';
import { useEffect } from 'react';
import { useCmsStore, useCmsLabel } from '@/lib/store/cmsStore';

export default function AppHeader() {
  const logo     = useCmsStore((s) => s.config.logo as string | undefined);
  const hdrTitle = useCmsLabel('hdrTitle', 'Production Schedule');

  useEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="hdr" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo || '/logo-header.png'}
        alt="Roseland Pictures"
        style={{ height: '88px', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
      />
      <span className="hdr-title">
        {hdrTitle}
      </span>
    </div>
  );
}
