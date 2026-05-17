'use client';
import type { ScheduleMeta } from '@/lib/types';

interface Props {
  type: 'CONTACT SHEET' | 'CALL SHEET';
  meta: ScheduleMeta;
}

function formatDate(d: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return d; }
}

export default function SheetPreviewHeader({ type, meta }: Props) {
  const dayLabel = meta.dayNumber && meta.totalDays
    ? `Day ${meta.dayNumber} of ${meta.totalDays}`
    : null;

  return (
    <div className="sheet-doc-header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/logo-white.png"
        alt="Roseland Pictures"
        className="sheet-doc-logo"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="sheet-doc-title-block">
        <div className="sheet-doc-type">{type}</div>
        <div className="sheet-doc-name">{meta.projectName || meta.prod || 'Untitled'}</div>
        {(meta.date || dayLabel) && (
          <div className="sheet-doc-date">
            {formatDate(meta.date)}{dayLabel ? ` · ${dayLabel}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
