import type { ScheduleRow, WeatherData } from './types.ts';

export interface CallSheetLine {
  timeIn: string; action: string; description: string; notes: string;
  locations: { name: string; address: string; description: string }[];
  isSun: boolean; long: boolean;
}
const activity = (row: ScheduleRow) => row.action === 'Other' ? row.otherText || 'Other' : row.action;

/** A prep or other timed activity is not evidence of a general crew call. */
export function callSheetCall(rows: ScheduleRow[]): { label: string; time: string } {
  const work = rows.filter(row => !row.sunLocked);
  const crew = work.find(row => activity(row).trim().toLowerCase() === 'crew call');
  if (crew) return { label: 'Crew Call', time: crew.timeIn || '' };
  const first = work.find(row => row.timeIn);
  return first ? { label: 'First scheduled activity', time: first.timeIn } : { label: 'Call time', time: '' };
}

function location(name: string | undefined, address: string | undefined, legacy: string, description = '') {
  const title = name || legacy || address || '';
  const full = address || (!name || legacy === name ? '' : legacy);
  return { name: title, address: full && full !== title ? full : '', description };
}

/** Preserve supplied work text and named/full locations, including untimed rows. */
export function callSheetLines(rows: ScheduleRow[]): CallSheetLine[] {
  return rows.flatMap(row => {
    const locations = [location(row.locName, row.locAddress, row.loc),
      ...(row.subLocations || []).map(sub => location(sub.name, sub.address, sub.loc, sub.desc))]
      .filter(loc => loc.name || loc.address || loc.description);
    const line = { timeIn: row.timeIn, action: activity(row), description: row.desc || '', notes: row.notes || '', locations, isSun: !!row.sunLocked };
    if (!line.timeIn && !line.action && !line.description && !line.notes && !locations.length) return [];
    return [{ ...line, long: JSON.stringify(line).length > 1800 }];
  });
}

export function callSheetWeather(wx: WeatherData | null | undefined): string[] {
  if (!wx) return [];
  const parts: string[] = [];
  if (wx.cond) parts.push(wx.cond);
  if (wx.minF != null && wx.maxF != null) parts.push(`${wx.minF}–${wx.maxF}°F`);
  else if (wx.maxF != null) parts.push(`High ${wx.maxF}°F`);
  else if (wx.minF != null) parts.push(`Low ${wx.minF}°F`);
  if (wx.prec != null) parts.push(`Precipitation ${wx.prec}%`);
  if (wx.sunrise) parts.push(`Sunrise ${wx.sunrise}`);
  if (wx.sunset) parts.push(`Sunset ${wx.sunset}`);
  return parts;
}
