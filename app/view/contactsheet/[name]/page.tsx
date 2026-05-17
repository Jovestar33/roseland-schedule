'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import { loadSheetMetaPublic } from '@/lib/api/sheets';
import { postLoadPublic } from '@/lib/api/load';
import type { SheetMeta, ScheduleData } from '@/lib/types';
import { defaultSheetMeta } from '@/lib/api/sheets';
import SheetPreviewHeader from '@/components/sheets/SheetPreviewHeader';

interface Props {
  params: Promise<{ name: string }>;
}

export default function PublicContactSheetPage({ params }: Props) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);

  const [meta, setMeta] = useState<SheetMeta>(defaultSheetMeta());
  const [schedData, setSchedData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadSheetMetaPublic(decodedName),
      postLoadPublic(decodedName),
    ]).then(([sm, sd]) => {
      setMeta(sm);
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
            <SheetPreviewHeader type="CONTACT SHEET" meta={scheduleMeta} />
          )}

          <div className="sheet-doc-body">

            {meta.distributionList.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Distribution</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Email</th></tr></thead>
                  <tbody>
                    {meta.distributionList.map((c, i) => (
                      <tr key={i}><td>{c.name}</td><td>{c.email}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {meta.clientReps.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Client Representatives</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Title</th><th>Phone</th><th>Email</th></tr></thead>
                  <tbody>
                    {meta.clientReps.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td><td>{c.title}</td><td>{c.phone}</td><td>{c.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {meta.emergencyContact.name && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Emergency Contact</div>
                <div className="sheet-doc-summary">
                  <div className="sheet-doc-summary-name">{meta.emergencyContact.name}</div>
                  {meta.emergencyContact.phone && (
                    <div className="sheet-doc-summary-detail">{meta.emergencyContact.phone}</div>
                  )}
                  {meta.emergencyContact.backupPhone && (
                    <div className="sheet-doc-summary-detail">Backup: {meta.emergencyContact.backupPhone}</div>
                  )}
                </div>
              </div>
            )}

            {meta.additionalCrew.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Additional Crew / Contacts</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead>
                  <tbody>
                    {meta.additionalCrew.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td><td>{c.role}</td><td>{c.phone}</td><td>{c.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {meta.dietaryRestrictions.length > 0 && (
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Dietary Restrictions</div>
                <table className="sheet-doc-table">
                  <thead><tr><th>Name</th><th>Notes</th></tr></thead>
                  <tbody>
                    {meta.dietaryRestrictions.map((d, i) => (
                      <tr key={i}><td>{d.name}</td><td>{d.notes}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
