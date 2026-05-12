'use client';
import { wxIcon } from '@/lib/weather';
import { computeTimeOut } from '@/lib/time';
import type { ScheduleData } from '@/lib/types';

function metaDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

interface Props {
  data: ScheduleData;
}

export default function ScheduleReadView({ data }: Props) {
  const { meta, rows } = data;
  const wx = meta.wx;
  const visibleRows = rows.filter(r => r.action || r.timeIn);
  const callTime = rows.find(r => !r.sunLocked)?.timeIn || '';

  return (
    <>
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

      <div className="panel">
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
              <label>Producer</label>
              <div className="call-disp">{meta.prod || '—'}</div>
            </div>
            <div className="mf">
              <label>Director</label>
              <div className="call-disp">{meta.dir || '—'}</div>
            </div>
            <div className="mf">
              <label>Camera</label>
              <div className="call-disp">{meta.dp || '—'}</div>
            </div>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="sched">
            <colgroup>
              <col className="c-n" />
              <col className="c-a" />
              <col className="c-l" />
              <col className="c-d" />
              <col className="c-nt" />
              <col className="c-dv" />
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
                <th className="col-dv" />
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
                      <td className="col-dv" />
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
                    <td className="col-dv" />
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
    </>
  );
}
