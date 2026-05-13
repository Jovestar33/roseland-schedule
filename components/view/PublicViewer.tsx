'use client';
import { useState, useEffect } from 'react';
import { postLoadPublic } from '@/lib/api/load';
import { printSchedule } from '@/lib/print';
import ScheduleReadView from './ScheduleReadView';
import type { ScheduleData } from '@/lib/types';

interface Props {
  name: string;
}

export default function PublicViewer({ name }: Props) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!name) {
      setStatus('error');
      setErrorMsg('Missing schedule name.');
      return;
    }
    postLoadPublic(name)
      .then(d => {
        if (!d) { setStatus('error'); setErrorMsg('Schedule not found.'); return; }
        setData(d);
        setStatus('ok');
      })
      .catch(e => {
        setStatus('error');
        setErrorMsg((e as Error).message || 'Could not load schedule.');
      });
  }, [name]);

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
      {/* Branded header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        background: '#0a0a0f',
        borderBottom: '1px solid rgba(255,255,255,.1)',
        gap: '12px',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-header.png"
          alt="Roseland Pictures"
          style={{ height: '78px', width: 'auto', objectFit: 'contain' }}
        />
        <button className="btn btn-light btn-sm" onClick={() => printSchedule(name)}>
          🖨 Print / Save PDF
        </button>
      </div>

      <ScheduleReadView data={data} />
    </div>
  );
}
