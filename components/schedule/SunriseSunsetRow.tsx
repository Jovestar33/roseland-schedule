'use client';
import { computeTimeOut } from '@/lib/time';
import type { ScheduleRow } from '@/lib/types';

interface Props {
  index: number;
  row: ScheduleRow;
}

export default function SunriseSunsetRow({ index, row }: Props) {
  const isSunrise = row.action.includes('Sunrise') || row.timeIn < '12:00 PM';
  const timeColor = isSunrise ? '#92400e' : '#9a3412';
  const timeOut = computeTimeOut(row);

  return (
    <tr className="sun-row">
      <td className="rn" />
      <td>
        <div className="sun-label">{row.action}</div>
      </td>
      <td />
      <td>
        {row.desc && <div className="sun-note">{row.desc}</div>}
      </td>
      <td />
      <td className="col-dv" />
      <td className="tc-t">
        <div className="tdsp" style={{ fontWeight: 700, color: timeColor }}>{row.timeIn}</div>
      </td>
      <td className="tc-t" />
      <td className="tc-t">
        {timeOut && <div className="tdsp tout">{timeOut}</div>}
      </td>
      <td />
      <td />
    </tr>
  );
}
