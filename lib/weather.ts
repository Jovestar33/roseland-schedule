import type { WeatherData } from './types';

export const WX_CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
  80: 'Rain Showers', 81: 'Rain Showers', 82: 'Heavy Showers', 95: 'Thunderstorm',
};

export function wxIcon(code: number): string {
  if (code <= 1) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  return '⛈️';
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

function rawToAP(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

export function calcSunTimes(
  dateStr: string,
  lat: number,
  lng: number,
  ianaTimezone?: string | null
): { sunrise: string; sunset: string } | null {
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const JD = 367 * yr - Math.floor(7 * (yr + Math.floor((mo + 9) / 12)) / 4)
    + Math.floor(275 * mo / 9) + dy + 1721013.5;
  const n = JD - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const lam = L + 1.915 * Math.sin(g * D2R) + 0.020 * Math.sin(2 * g * D2R);
  const ep = 23.439 - 0.0000004 * n;
  const sinDec = Math.sin(ep * D2R) * Math.sin(lam * D2R);
  const dec = Math.asin(sinDec) * R2D;
  const cosH = -Math.tan(lat * D2R) * Math.tan(dec * D2R);
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) * R2D;
  const RA = (Math.atan2(Math.cos(ep * D2R) * Math.sin(lam * D2R), Math.cos(lam * D2R)) * R2D + 360) % 360;
  const EqT = L - RA;
  const noon = 12 - lng / 15 - EqT / 15;
  const srUTC = noon - H / 15;
  const ssUTC = noon + H / 15;

  let offsetHours = -(new Date(dateStr + 'T12:00:00Z').getTimezoneOffset() / 60);
  if (ianaTimezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaTimezone, hour: 'numeric', minute: 'numeric', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date(dateStr + 'T12:00:00Z'));
      const p: Record<string, string> = {};
      parts.forEach(x => { p[x.type] = x.value; });
      const localHour = parseInt(p.hour, 10);
      const localMin = parseInt(p.minute, 10);
      offsetHours = localHour + localMin / 60 - 12;
      if (offsetHours < -14) offsetHours += 24;
      if (offsetHours > 14) offsetHours -= 24;
    } catch { /* use browser offset */ }
  }

  function fmtLocal(utcH: number): string {
    const total = ((utcH + offsetHours) % 24 + 24) % 24;
    const hh = Math.floor(total);
    const mm = Math.round((total - hh) * 60);
    return rawToAP(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'));
  }

  return { sunrise: fmtLocal(srUTC), sunset: fmtLocal(ssUTC) };
}

async function fetchSunOnly(
  date: string,
  lat: number,
  lng: number
): Promise<{ sunrise: string; sunset: string } | null> {
  const urls = [
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=sunrise,sunset&timezone=auto&start_date=${date}&end_date=${date}`,
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=sunrise,sunset&timezone=auto&start_date=${date}&end_date=${date}`,
  ];

  let ianaTimezone: string | null = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tzRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=sunrise&timezone=auto&start_date=${today}&end_date=${today}`
    );
    const tzJ = await tzRes.json() as { timezone?: string };
    if (tzJ.timezone && tzJ.timezone !== 'GMT' && tzJ.timezone !== 'UTC') {
      ianaTimezone = tzJ.timezone;
    }
  } catch { /* ignore */ }

  for (const url of urls) {
    try {
      const r = await fetch(url);
      const j = await r.json() as { daily?: { sunrise?: string[]; sunset?: string[] } };
      if (j.daily?.sunrise?.length) {
        return {
          sunrise: rawToAP(j.daily.sunrise[0].slice(11)),
          sunset: rawToAP(j.daily.sunset![0].slice(11)),
        };
      }
    } catch { /* try next */ }
  }

  return calcSunTimes(date, lat, lng, ianaTimezone);
}

export async function fetchWeather(
  date: string,
  lat: number,
  lng: number,
  town?: string
): Promise<WeatherData | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shoot = new Date(date + 'T12:00:00');
  const diff = Math.round((shoot.getTime() - today.getTime()) / 86400000);
  const fetchedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (diff > 16) {
    const sun = await fetchSunOnly(date, lat, lng);
    if (!sun) return null;
    return { ...sun, fetchedAt, town, noForecast: true };
  }

  if (diff < -1) return null;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset&temperature_unit=celsius&timezone=auto&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    const wx = await res.json() as {
      daily?: {
        time?: string[];
        sunrise?: string[];
        sunset?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        weathercode?: number[];
      };
    };

    if (!wx.daily?.time?.length) {
      const sun = await fetchSunOnly(date, lat, lng);
      if (!sun) return null;
      return { ...sun, fetchedAt, town, noForecast: true };
    }

    const d = wx.daily;
    const sunrise = rawToAP(d.sunrise![0].slice(11));
    const sunset = rawToAP(d.sunset![0].slice(11));
    const maxC = d.temperature_2m_max![0];
    const minC = d.temperature_2m_min![0];
    const prec = d.precipitation_probability_max![0];
    const code = d.weathercode![0];

    return {
      sunrise,
      sunset,
      maxC,
      minC,
      maxF: cToF(maxC),
      minF: cToF(minC),
      prec,
      code,
      cond: WX_CODES[code] || 'Unknown',
      fetchedAt,
      town,
    };
  } catch {
    const sun = await fetchSunOnly(date, lat, lng);
    if (!sun) return null;
    return { ...sun, fetchedAt, town, noForecast: true };
  }
}
