'use client';
import { useState, useEffect } from 'react';
import { postLoadView } from '@/lib/api/load';
import { printSchedule } from '@/lib/print';
import ScheduleReadView from './ScheduleReadView';
import type { ScheduleData } from '@/lib/types';

interface Props {
  name: string;
  viewToken: string;
}

export default function ReadOnlyViewer({ name, viewToken }: Props) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!name || !viewToken) {
      setStatus('error');
      setErrorMsg('Missing schedule name or access token.');
      return;
    }
    postLoadView(name, viewToken)
      .then(d => {
        if (!d) { setStatus('error'); setErrorMsg('Schedule not found.'); return; }
        setData(d);
        setStatus('ok');
      })
      .catch(e => {
        setStatus('error');
        setErrorMsg((e as Error).message || 'Could not load schedule.');
      });
  }, [name, viewToken]);

  if (status === 'loading') {
    return <div className="empty" style={{ padding: '40px', textAlign: 'center' }}>Loading…</div>;
  }

  if (status === 'error') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>Unable to load schedule</div>
        <div style={{ color: '#64748b', fontSize: '14px' }}>{errorMsg}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div
        className="readonly-bar"
        style={{ display: 'flex', background: '#f0fdf4', borderBottom: '2px solid #16a34a', padding: '10px 24px', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}
      >
        <span>🔒 Read-only view — shared by Roseland Pictures</span>
        <button className="btn btn-light btn-sm" onClick={() => printSchedule(name)}>🖨 Print / Save PDF</button>
      </div>
      <ScheduleReadView data={data} />
    </div>
  );
}
