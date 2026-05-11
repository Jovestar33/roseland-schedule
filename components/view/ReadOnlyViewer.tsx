'use client';
import { useState, useEffect } from 'react';
import { postLoadView } from '@/lib/api/load';
import { wxIcon } from '@/lib/weather';
import type { ScheduleData, ScheduleRow } from '@/lib/types';

interface Props {
  name: string;
  viewToken: string;
}

function metaDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function computeTimeOut(row: ScheduleRow): string {
  if (row.fixedOut && row.fixedOutTime) return row.fixedOutTime;
  if (!row.timeIn || !row.dur) return '';
  const [hStr, rest] = row.timeIn.split(':');
  const [mStr, ap] = (rest || '').split(' ');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (ap?.toUpperCase() === 'PM' && h !== 12) h += 12;
  else if (ap?.toUpperCase() === 'AM' && h === 12) h = 0;
  const startMin = h * 60 + m;
  const [dh, dm] = row.dur.split(':').map(Number);
  const endMin = startMin + dh * 60 + dm;
  const eh = Math.floor(endMin / 60) % 24;
  const em = endMin % 60;
  const eap = eh >= 12 ? 'PM' : 'AM';
  const eh12 = eh % 12 || 12;
  return `${eh12}:${String(em).padStart(2, '0')} ${eap}`;
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

  const { meta, rows } = data;
  const wx = meta.wx;
  const visibleRows = rows.filter(r => r.action || r.timeIn);
  const callTime = rows[0]?.timeIn || '';

  return (
    <div>
      {/* Read-only bar */}
      <div
        className="readonly-bar"
        style={{ display: 'flex', background: '#f0fdf4', borderBottom: '2px solid #16a34a', padding: '10px 24px', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}
      >
        <span>🔒 Read-only view — shared by Roseland Pictures</span>
        <button className="btn btn-light btn-sm" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      </div>

      {/* Weather strip */}
      {wx && (
        <div className="wx-strip show">
          <div className="wx-item">
            <span className="wx-label">Sunrise</span>
            <span className="wx-val wx-sunrise">🌅 {wx.sunrise || '—'}</span>
          </div>
          <div className="wx-item">
            <span className="wx-label">Sunset</span>
            <span className="wx-val wx-sunset">🌇 {wx.sunset || '—'}</span>
          </div>
          {!wx.noForecast && wx.maxF !== undefined && (
            <>
              <div className="wx-item">
                <span className="wx-label">High / Low</span>
                <span className="wx-val">{wx.maxF}°F / {wx.minF}°F</span>
              </div>
              <div className="wx-item">
                <span className="wx-label">Conditions</span>
                <span className="wx-val">{wx.code !== undefined ? `${wxIcon(wx.code)} ${wx.cond}` : '—'}</span>
              </div>
              {wx.prec !== undefined && (
                <div className="wx-item">
                  <span className="wx-label">Precip</span>
                  <span className="wx-val">{wx.prec}%</span>
                </div>
              )}
            </>
          )}
          {wx.fetchedAt && (
            <div className="wx-item" style={{ border: 'none', margin: 0, minWidth: 0 }}>
              <span className="wx-label">Updated</span>
              <span className="wx-val">{wx.fetchedAt}</span>
            </div>
          )}
        </div>
      )}

      {/* Schedule panel */}
      <div className="panel">
        {/* Meta header */}
        <div className="meta">
          <div className="meta-grid">
            <div className="mf">
              <label>Town / Location</label>
              <div className="call-disp">{meta.town || '—'}</div>
            </div>
            <div className="mf">
              <label>Date</label>
              <div className="call-disp">{meta.date ? metaDate(meta.date) : '—'}</div>
            </div>
            <div className="mf">
              <label>Call Time</label>
              <div className="call-disp">{callTime || '—'}</div>
            </div>
            <div className="mf">
              <label>Production</label>
              <div className="call-disp">{meta.prod || '—'}</div>
            </div>
            <div className="mf">
              <label>Director</label>
              <div className="call-disp">{meta.dir || '—'}</div>
            </div>
            <div className="mf">
              <label>DP</label>
              <div className="call-disp">{meta.dp || '—'}</div>
            </div>
          </div>
        </div>

        {/* Schedule grid */}
        <div className="tbl-wrap">
          <table className="sched">
            <colgroup>
              <col className="c-n" />
              <col className="c-a" />
              <col className="c-l" />
              <col className="c-d" />
              <col className="c-nt" />
              <col className="c-ti" />
              <col className="c-du" />
              <col className="c-to" />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="tp">Action</th>
                <th>Location</th>
                <th>Description</th>
                <th>Notes</th>
                <th className="tc tp">Time In</th>
                <th className="tc tp">Duration</th>
                <th className="tc tp">Time Out</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => {
                if (row.sunLocked) {
                  return (
                    <tr key={i} className="sun-row">
                      <td />
                      <td colSpan={4} style={{ fontStyle: 'italic', color: '#64748b', fontSize: '13px', paddingLeft: '10px' }}>
                        {row.action}
                        {row.desc && <span style={{ marginLeft: '8px', opacity: 0.7 }}>{row.desc}</span>}
                      </td>
                      <td className="tc" style={{ color: '#64748b', fontStyle: 'italic' }}>{row.timeIn}</td>
                      <td />
                      <td />
                    </tr>
                  );
                }
                return (
                  <tr key={i} className={row.done ? 'completed' : undefined}>
                    <td className="rn">{i + 1}</td>
                    <td>{row.action === 'Other' ? row.otherText || 'Other' : row.action}</td>
                    <td>
                      {row.locLat && row.locLng ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${row.locLat},${row.locLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'underline dotted' }}
                        >
                          {row.loc}
                        </a>
                      ) : row.loc || ''}
                    </td>
                    <td>{row.desc}</td>
                    <td>{row.notes}</td>
                    <td className="tc">{row.timeIn}</td>
                    <td className="tc">{row.dur}</td>
                    <td className="tc">{computeTimeOut(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
