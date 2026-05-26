'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useProductionStore } from '@/lib/store/productionStore';
import { getLibraryMeta } from '@/lib/api/library';
import DayList from './DayList';
import ProductionSettings from './ProductionSettings';

type Tab = 'days' | 'settings';

interface Props {
  prodKey: string;
}

export default function ProductionDashboard({ prodKey }: Props) {
  const router  = useRouter();
  const token   = useAuthStore((s) => s.token);
  const loading       = useProductionStore((s) => s.loading);
  const loaded        = useProductionStore((s) => s.loaded);
  const error         = useProductionStore((s) => s.error);
  const load          = useProductionStore((s) => s.load);
  const getByProdKey  = useProductionStore((s) => s.getByProdKey);

  const [tab,           setTab]           = useState<Tab>('days');
  const [scheduleNames, setScheduleNames] = useState<string[]>([]);

  useEffect(() => {
    if (token && !loaded) load();
  }, [token, loaded, load]);

  useEffect(() => {
    if (!token) return;
    getLibraryMeta(token).then((lib) => {
      const phases = lib.phaseOrder?.[prodKey];
      if (!phases) return;
      const names: string[] = [];
      for (const list of Object.values(phases)) {
        for (const n of list) names.push(n);
      }
      setScheduleNames(names);
    }).catch(() => {});
  }, [token, prodKey]);

  if (!loaded && !error) {
    return <div className="pc-page"><p className="pc-loading">Loading…</p></div>;
  }

  const production = getByProdKey(prodKey);

  if (!production) {
    return (
      <div className="pc-page">
        <nav className="pc-nav">
          <Link href="/productions" className="pc-nav-back">← Productions</Link>
        </nav>
        <div className="pc-claim-card">
          <p>No production found for <strong>{prodKey}</strong>.</p>
          <button className="btn btn-light btn-sm" onClick={() => router.push('/productions')}>
            Back to Productions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-page">
      <nav className="pc-nav">
        <Link href="/productions" className="pc-nav-back">← Productions</Link>
        <div className="pc-dash-meta">
          <h1 className="pc-dash-title">{production.title}</h1>
          {production.clientName && (
            <div className="pc-dash-client">{production.clientName}</div>
          )}
        </div>
        {production.status && (
          <span className={`pc-status-pill ${production.status}`}>{statusLabel(production.status)}</span>
        )}
      </nav>

      <div className="pc-dash-tabs">
        <button
          className={`pc-tab-btn${tab === 'days' ? ' active' : ''}`}
          onClick={() => setTab('days')}
        >
          Days
        </button>
        <button
          className={`pc-tab-btn${tab === 'settings' ? ' active' : ''}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      {tab === 'days' && (
        <DayList production={production} scheduleNames={scheduleNames} />
      )}
      {tab === 'settings' && (
        <ProductionSettings production={production} />
      )}
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'development':    return 'Development';
    case 'pre-production': return 'Pre-Production';
    case 'in-production':  return 'In Production';
    case 'post':           return 'Post';
    case 'delivered':      return 'Delivered';
    case 'archived':       return 'Archived';
    default:               return s;
  }
}
