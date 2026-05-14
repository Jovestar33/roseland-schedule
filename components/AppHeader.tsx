'use client';
import { useEffect, useRef } from 'react';
import { useCmsStore, useCmsLabel } from '@/lib/store/cmsStore';

function readSafeAreaTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0;pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);
  const val = parseFloat(getComputedStyle(probe).top) || 0;
  document.body.removeChild(probe);
  return Math.max(70, val);
}

export default function AppHeader() {
  const logo     = useCmsStore((s) => s.config.logo as string | undefined);
  const hdrTitle = useCmsLabel('hdrTitle', 'Production Schedule');
  const hdrRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    const apply = () => {
      if (hdrRef.current) hdrRef.current.style.paddingTop = `${readSafeAreaTop()}px`;
    };

    apply();
    // Re-apply as Safari chrome settles (address bar show/hide, orientation change)
    const t1 = setTimeout(apply, 100);
    const t2 = setTimeout(apply, 500);
    window.addEventListener('resize', apply);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', apply);
    };
  }, []);

  return (
    <div ref={hdrRef} className="hdr" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
