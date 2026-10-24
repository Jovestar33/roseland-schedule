import {timingAnalysis,hasPlannedWork} from './flexible-time.ts';
import {t12m} from './time.ts';
import {displayTimeIn,displayTimeOut} from './time.ts';
import type { ScheduleMeta, ScheduleRow, WeatherData } from './types.ts';

export interface CallSheetLine {
  timeIn: string; action: string; description: string; notes: string; keyInstruction: string; cast: string;
  locations: { name: string; address: string; description: string }[];
  isSun: boolean; long: boolean;
}
const activity = (row: ScheduleRow) => row.action === 'Other' ? row.otherText || 'Other' : row.action;

/** A prep or other timed activity is not evidence of a general crew call. */
export function callSheetCall(rows: ScheduleRow[]): { label: string; time: string } {
  const work = rows.filter(row => !row.sunLocked);
  const crew = work.find(row => activity(row).trim().toLowerCase() === 'crew call');
  if (crew) return { label: 'Crew Call', time: displayTimeIn(crew) };
  const first = work.find(row => row.timeIn);
  return first ? { label: 'First scheduled activity', time: displayTimeIn(first) } : { label: 'Call time', time: '' };
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
    const line = { timeIn: displayTimeIn(row), action: activity(row), description: row.desc?.trim() || '', notes: row.notes?.trim() || '', keyInstruction: row.keyInstruction?.trim() || '', cast: row.cast?.trim() || '', locations, isSun: !!row.sunLocked };
    if (!line.timeIn && !line.action && !line.description && !line.notes && !line.keyInstruction && !line.cast && !locations.length) return [];
    return [{ ...line, long: JSON.stringify(line).length > 1800 }];
  });
}

export function callSheetWeather(wx: WeatherData | null | undefined): string[] {
  if (!wx) return ['Forecast not added'];
  if(wx.noForecast)return ['Forecast unavailable for this date',...(wx.sunrise?[`Sunrise ${wx.sunrise}`]:[]),...(wx.sunset?[`Sunset ${wx.sunset}`]:[])];
  const parts: string[] = [];
  if (wx.cond) parts.push(wx.cond);
  if (wx.minF != null && wx.maxF != null) parts.push(`${wx.minF}–${wx.maxF}°F`);
  else if (wx.maxF != null) parts.push(`High ${wx.maxF}°F`);
  else if (wx.minF != null) parts.push(`Low ${wx.minF}°F`);
  if (wx.prec != null) parts.push(`Precipitation ${wx.prec}%`);
  if (wx.sunrise) parts.push(`Sunrise ${wx.sunrise}`);
  if (wx.sunset) parts.push(`Sunset ${wx.sunset}`);
  if(wx.fetchedAt&&Number.isFinite(Date.parse(wx.fetchedAt)))parts.push(`Updated ${new Date(wx.fetchedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`);
  return parts;
}

/** Derive only labelled events; never relabel a prep time as a crew call. */
export function callSheetOverview(rows:ScheduleRow[]){
 const work=rows.filter(r=>!r.sunLocked),find=(test:RegExp)=>{const row=work.find(r=>test.test(activity(r)));return row?displayTimeIn(row):'';};
 const last=[...work].reverse().find(r=>r.timeIn),wrap=work.find(r=>/^wrap$/i.test(activity(r)));
 return {crewCall:find(/^crew call$/i),firstShot:find(/shoot|film|interview/i),mealTime:find(/lunch|dinner|meal/i),estimatedWrap:(wrap?.fixedOut?displayTimeOut(wrap):find(/^wrap$/i))||(last?displayTimeOut(last):'')};
}
export function callSheetChecks(meta:ScheduleMeta,rows:ScheduleRow[],now=Date.now()):string[]{
 const cs=meta.callsheet??{},times=callSheetOverview(rows),checks:string[]=[];
 if(meta.timing){const a=timingAnalysis(rows,meta.timing.between);if(a.gaps.length||a.conflicts.length)checks.push('Review schedule gaps, overlaps and fixed-time conflicts.');if(rows.some(r=>hasPlannedWork(r)&&!r.dur))checks.push('Fill in missing action durations.');if(a.unresolved.length)checks.push('Set or complete the fixed times needed to calculate the schedule.');}
 if(!meta.date)checks.push('Set the shoot date.');
 if(!cs.crewCall&&!times.crewCall)checks.push('Set a crew call time.');
 if(!cs.reportLocation?.trim())checks.push('Add the first reporting address.');
 if(!cs.primaryContact?.trim()||!cs.primaryPhone?.trim())checks.push('Add an on-set contact and phone number.');
 if(!cs.hospital?.trim())checks.push('Confirm the hospital and emergency directions.');
 if(!cs.timeZone)checks.push('Choose the location’s time zone.');
 if(!meta.wx||meta.wx.noForecast)checks.push('A weather forecast is not available.');
 else if(!meta.wx.fetchedAt||!Number.isFinite(Date.parse(meta.wx.fetchedAt))||now-Date.parse(meta.wx.fetchedAt)>24*60*60*1000)checks.push('Refresh the weather before sharing.');
 for(const c of meta.productionContacts??[]){
  if(c.type==='cast'&&!c.callTime)checks.push(`Set an individual call for ${c.name}.`);
  if(c.callTime&&c.readyTime&&t12m(c.readyTime)<t12m(c.callTime))checks.push(`Check ${c.name}’s arrival and ready-on-set times, including any overnight call.`);
 }
 return checks;
}
