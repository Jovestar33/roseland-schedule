'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import { loadCallSheetDataPublic, defaultCallSheetData } from '@/lib/api/sheets';
import { postLoadPublic } from '@/lib/api/load';
import type { CallSheetData, ScheduleData } from '@/lib/types';
import SheetPreviewHeader from '@/components/sheets/SheetPreviewHeader';

interface Props {
  params: Promise<{ name: string }>;
}

export default function PublicCallSheetPage({ params }: Props) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);

  const [data, setData] = useState<CallSheetData>(defaultCallSheetData());
  const [schedData, setSchedData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadCallSheetDataPublic(decodedName),
      postLoadPublic(decodedName),
    ]).then(([cd, sd]) => {
      setData(cd);
      setSchedData(sd);
    }).catch(console.error).finally(() => setLoading(false));
  }, [decodedName]);

  if (loading) {
    return <div className="sheet-public-page"><div className="sheet-loading">Loading…</div></div>;
  }

  const scheduleMeta = schedData?.meta;

  return (
    <div className="sheet-public-page">
      <div className="sheet-public-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/logo-white.png"
          alt="Roseland Pictures"
          className="sheet-public-logo"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      <div className="sheet-public-body">
        <div className="sheet-doc">
          {scheduleMeta && (
            <SheetPreviewHeader type="CALL SHEET" meta={scheduleMeta} />
          )}

          <div className="sheet-doc-body">

            {data.hospital.name && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Nearest Hospital / ER</div>
                <div className="sheet-doc-location">
                  <div className="sheet-doc-location-name">{data.hospital.name}</div>
                  {data.hospital.address && (
                    <div className="sheet-doc-location-detail">{data.hospital.address}</div>
                  )}
                  {data.hospital.phone && (
                    <div className="sheet-doc-location-detail">{data.hospital.phone}</div>
                  )}
                </div>
              </div>
            )}

            {data.parking && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Parking</div>
                <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                  {data.parking}
                </div>
              </div>
            )}

            {data.staggeredCalls.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Staggered Calls</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Role</th><th>Call Time</th></tr></thead>
                  <tbody>
                    {data.staggeredCalls.map((s, i) => (
                      <tr key={i}><td>{s.name}</td><td>{s.role}</td><td>{s.callTime}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.castBlock.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Cast</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Role</th><th>Call</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.castBlock.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td>{c.role}</td>
                        <td>{c.callTime}</td>
                        <td>{c.status && <span className="sheet-status-chip">{c.status}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.crewBlock.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Crew</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Dept</th><th>Name</th><th>Call</th><th>Ch.</th></tr></thead>
                  <tbody>
                    {data.crewBlock.map((c, i) => (
                      <tr key={i}>
                        <td>{c.department}</td>
                        <td>{c.name}</td>
                        <td>{c.callTime}</td>
                        <td>{c.walkieChannel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.condensedDayOverride && data.condensedDayOverride.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Day at a Glance</div>
                <div className="sheet-doc-day-list">
                  {data.condensedDayOverride.map((item, i) => (
                    <div className="sheet-doc-day-item" key={i}>
                      <span className="sheet-doc-day-time">{item.time}</span>
                      <span className="sheet-doc-day-note">{item.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.advancedSchedule && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Advanced Schedule</div>
                <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                  {data.advancedSchedule}
                </div>
              </div>
            )}

            {data.departmentNotes.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Department Notes</div>
                {data.departmentNotes.map((dn, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    {dn.department && (
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{dn.department}</div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                      {dn.note}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.generalNotes && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">General Notes</div>
                <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                  {data.generalNotes}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
