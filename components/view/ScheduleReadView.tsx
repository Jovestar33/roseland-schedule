'use client';
import { wxIcon } from '@/lib/weather';
import { computeTimeOut } from '@/lib/time';
import type { ScheduleData, SubLocation } from '@/lib/types';

const ACTION_CLASSES: Record<string, string> = {
  'Shoot':     'aShoot',
  'Lunch':     'aLunch',
  'Dinner':    'aDinner',
  'Wrap':      'aWrap',
  'Day Off':   'aDayOff',
  'Drive':     'aDrive',
  'Move':      'aMove',
  'Crew Call': 'aCrewCall',
  'Breakfast': 'aBreakfast',
  'Break':     'aBreak',
  'Setup':     'aSetup',
  'Other':     'aOther',
};

function metaDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function SubLocList({ subLocations }: { subLocations: SubLocation[] }) {
  return (
    <div className="rv-sublocs">
      {subLocations.map((sl, i) => (
        <div key={sl.id || String(i)} className="rv-subloc">
          <span className="rv-subloc-bullet">↳</span>
          <div className="rv-subloc-body">
            {sl.locLat && sl.locLng ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${sl.locLat},${sl.locLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rv-subloc-loc"
              >
                {sl.loc}
              </a>
            ) : (
              <span className="rv-subloc-loc">{sl.loc}</span>
            )}
            {sl.desc && <div className="rv-subloc-desc">{sl.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  data: ScheduleData;
  name?: string;
}

export default function ScheduleReadView({ data, name }: Props) {
  const { meta, rows } = data;
  const wx = meta.wx;
  const visibleRows = rows.filter(r => r.action || r.timeIn);
  const callTime = rows.find(r => !r.sunLocked)?.timeIn || '';

  const scheduleName = name || '';
  const projectName = meta.projectName || '';
  const dayInfo = meta.dayNumber != null
    ? `Day ${meta.dayNumber}${meta.totalDays ? ` of ${meta.totalDays}` : ''}`
    : '';
  const subInfo = [meta.phase, dayInfo].filter(Boolean).join('  ·  ');

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

      <div className="panel rv-panel">
        {(scheduleName || projectName) && (
          <div className="rv-identity">
            {scheduleName && <div className="rv-identity-name">{scheduleName}</div>}
            {projectName && <div className="rv-identity-title">{projectName}</div>}
            {subInfo && <div className="rv-identity-meta">{subInfo}</div>}
          </div>
        )}

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

        <div className="scroll-hint" aria-hidden="true">← Scroll to view time columns →</div>

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
                const actionCls = ACTION_CLASSES[row.action];
                return (
                  <tr key={i}>
                    <td className="rn">{i + 1}</td>
                    <td>
                      <span className={`rv-action${actionCls ? ` ${actionCls}` : ''}`}>
                        {row.action === 'Other' ? row.otherText || 'Other' : row.action}
                      </span>
                    </td>
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
                      {row.subLocations && row.subLocations.length > 0 && (
                        <SubLocList subLocations={row.subLocations} />
                      )}
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
