'use client';
import { useEffect } from 'react';
import { useCmsStore, useCmsLabel } from '@/lib/store/cmsStore';

export default function AppHeader() {
  const logo     = useCmsStore((s) => s.config.logo as string | undefined);
  const hdrTitle = useCmsLabel('hdrTitle', 'Production Schedule');

  useEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    // Use setProperty with 'important' so the inline style has the absolute
    // highest CSS priority — CSS !important in any stylesheet cannot override it.
    // Previous JS approaches set a normal inline style, which CSS !important beats.
    if (window.matchMedia('(max-width: 760px)').matches) {
      const hdr = document.querySelector<HTMLElement>('.hdr');
      hdr?.style.setProperty('padding-top', 'max(70px, env(safe-area-inset-top, 70px))', 'important');
    }
  }, []);

  return (
    <div className="hdr" style={{ position: 'relative', display: 'flex' }}>
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
