'use client';
import { useRouter } from 'next/navigation';
import { useCmsStore } from '@/lib/store/cmsStore';

export default function AppHeader() {
  const router = useRouter();
  const openCmsModal = useCmsStore((s) => s.openModal);

  return (
    <div className="hdr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-header.png" alt="Roseland Pictures" style={{ height: '88px', width: 'auto', objectFit: 'contain', display: 'block' }} />
      <span className="hdr-title" style={{ flex: 1, textAlign: 'center' }}>Production Schedule</span>
      <div className="hdr-right">
        <button className="btn btn-dark btn-sm" onClick={() => router.push('/schedule/Untitled')}>+ New</button>
        <button className="btn btn-pink btn-sm" onClick={() => router.push('/')}>&#128193; Library</button>
        <button className="btn btn-dark btn-sm" onClick={() => window.print()}>&#128438; Print</button>
        <button className="btn btn-dark btn-sm" onClick={openCmsModal}>&#9881; CMS</button>
      </div>
    </div>
  );
}
