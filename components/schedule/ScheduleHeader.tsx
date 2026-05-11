'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';

export default function ScheduleHeader() {
  const meta      = useScheduleStore((s) => s.meta);
  const rows      = useScheduleStore((s) => s.rows);
  const updateMeta = useScheduleStore((s) => s.updateMeta);

  const callTime = rows[0]?.timeIn || '';

  return (
    <div className="meta">
      <div className="meta-grid">
        <div className="mf">
          <label htmlFor="m-town">Town / Location</label>
          <input
            id="m-town"
            type="text"
            value={meta.town}
            onChange={(e) => updateMeta({ town: e.target.value })}
            placeholder="City, State"
          />
        </div>
        <div className="mf">
          <label htmlFor="m-date">Date</label>
          <input
            id="m-date"
            type="date"
            value={meta.date}
            onChange={(e) => updateMeta({ date: e.target.value })}
          />
        </div>
        <div className="mf">
          <label>Call Time</label>
          <div className="call-disp">{callTime}</div>
        </div>
        <div className="mf">
          <label htmlFor="m-prod">Production</label>
          <input
            id="m-prod"
            type="text"
            value={meta.prod}
            onChange={(e) => updateMeta({ prod: e.target.value })}
            placeholder="Film / Show title"
          />
        </div>
        <div className="mf">
          <label htmlFor="m-dir">Director</label>
          <input
            id="m-dir"
            type="text"
            value={meta.dir}
            onChange={(e) => updateMeta({ dir: e.target.value })}
            placeholder="Director name"
          />
        </div>
        <div className="mf">
          <label htmlFor="m-dp">DP</label>
          <input
            id="m-dp"
            type="text"
            value={meta.dp}
            onChange={(e) => updateMeta({ dp: e.target.value })}
            placeholder="DP name"
          />
        </div>
      </div>
    </div>
  );
}
