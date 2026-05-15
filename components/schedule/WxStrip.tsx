'use client';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import { wxIcon } from '@/lib/weather';

interface Props {
  onRefresh: () => void;
  onClear: () => void;
}

export default function WxStrip({ onRefresh, onClear }: Props) {
  const wx = useScheduleStore((s) => s.meta.wx);
  const town = useScheduleStore((s) => s.meta.town);

  if (!wx) return null;

  const searchQ = encodeURIComponent((wx.town || town || '').split(',')[0].trim() + ' weather');

  return (
    <div className="wx-strip show">
      <div className="wx-item">
        <span className="wx-label">Sunrise</span>
        <span className="wx-val wx-sunrise">🌅 {wx.sunrise || '—'}</span>
      </div>
      <div className="wx-item">
        <span className="wx-label">Sunset</span>
        <span className="wx-val wx-sunset">🌇 {wx.sunset || '—'}</span>
      </div>
      {!wx.noForecast && (
        <>
          <div className="wx-item">
            <span className="wx-label">High / Low</span>
            <span className="wx-val">
              {wx.maxF !== undefined ? `${wx.maxF}°F / ${wx.minF}°F` : '—'}
            </span>
          </div>
          <div className="wx-item">
            <span className="wx-label">Conditions</span>
            <span className="wx-val">
              {wx.code !== undefined ? `${wxIcon(wx.code)} ${wx.cond}` : '—'}
            </span>
          </div>
          <div className="wx-item">
            <span className="wx-label">Precip</span>
            <span className="wx-val" id="wx-prec">
              {wx.prec !== undefined ? (
                <>
                  {wx.prec}%&nbsp;
                  <a
                    href={`https://www.google.com/search?q=${searchQ}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#38bdf8', fontSize: '11px' }}
                  >
                    Google Weather ↗
                  </a>
                </>
              ) : '—'}
            </span>
          </div>
        </>
      )}
      {wx.noForecast && (
        <div className="wx-item">
          <span className="wx-label">Forecast</span>
          <span className="wx-val">Not yet available</span>
        </div>
      )}
      <div className="wx-item" style={{ border: 'none', margin: 0, minWidth: 0 }}>
        <span className="wx-label">Updated</span>
        <span className="wx-val wx-ts" id="wx-ts">{wx.fetchedAt || '—'}</span>
      </div>
      <div className="wx-refresh-row">
        <button className="wx-refresh" onClick={onRefresh} title="Refresh weather">↻ Refresh</button>
        <button className="wx-refresh" onClick={onClear} title="Clear weather">✕ Clear</button>
      </div>
    </div>
  );
}
