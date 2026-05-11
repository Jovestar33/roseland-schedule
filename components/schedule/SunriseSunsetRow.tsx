'use client';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function SunriseSunsetRow({ index, row }: Props) {
  const isSunrise = row.action === 'Sunrise' || row.timeIn < '12:00 PM';
  const actionClass = isSunrise ? 'aSunrise' : 'aSunset';
  const label = row.action || (isSunrise ? '🌅 Sunrise' : '🌇 Sunset');

  return (
    <tr className="sun-row">
      <td className="rn">{index + 1}</td>
      <td>
        <span className={`sun-label ${actionClass}`}>{label}</span>
      </td>
      <td>{row.loc && <span className="tdsp">{row.loc}</span>}</td>
      <td>{row.desc && <span className="tdsp">{row.desc}</span>}</td>
      <td />
      <td className="col-dv" />
      <td className="tc-t">
        <span className="anchor-text">{row.timeIn}</span>
        {row.notes && <div className="sun-note">{row.notes}</div>}
      </td>
      <td className="tc-t" />
      <td className="tc-t" />
      <td />
      <td />
    </tr>
  );
}
