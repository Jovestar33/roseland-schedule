import type { ScheduleData } from './types';
import { computeTimeOut, durm, mDur } from './time';

export type SchedulePrintMode = 'compact' | 'inline';
export type SchedulePaper = 'letter' | 'a4';
export type MeasureText = (text: string, bold: boolean, size: number) => number;
interface Line { text: string; bold?: boolean; ref?: string }
interface PrintedRow { number: number; continued: boolean; cells: Line[][] }
interface NotesBlock { ref: string; title: string[]; lines: string[]; continued: boolean }
interface Page { kind: 'schedule' | 'notes'; rows: PrintedRow[]; notes: NotesBlock[] }
export interface PrintLayout {
  pages: Page[]; schedulePages: number; notesPages: number;
  references: Record<string, number>; header: string[]; name: string;
  width: number; height: number; columns: number[]; contentWidth: number;
  headerHeight: number; totalDuration: string; mode: SchedulePrintMode; paper: SchedulePaper;
}

/** Preserve every character, explicit newline and blank line; split long tokens too. */
export function wrapPrintText(value: string, width: number, measure: (text: string) => number): string[] {
  if (!value) return [];
  const result: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { result.push(''); continue; }
    let remaining = Array.from(paragraph);
    while (remaining.length) {
      let lo = 1, hi = remaining.length, fits = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (measure(remaining.slice(0, mid).join('')) <= width) { fits = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (fits < remaining.length) {
        // Keep a word together where possible, without dropping whitespace.
        for (let i = fits - 1; i > 0; i--) {
          if (/\s/.test(remaining[i])) { fits = i + 1; break; }
        }
      }
      result.push(remaining.slice(0, fits).join(''));
      remaining = remaining.slice(fits);
    }
  }
  return result;
}

const LINE = 16, PAD = 34, ROW_PAD = 14, FOOTER = 28, TABLE_HEAD = 30;
export function layoutSchedulePrint(data: ScheduleData, name: string, mode: SchedulePrintMode, paper: SchedulePaper, measure: MeasureText): PrintLayout {
  const width = paper === 'a4' ? 1122.52 : 1056;
  const height = paper === 'a4' ? 793.7 : 816;
  const contentWidth = width - PAD * 2;
  const columns = [.045, .105, .18, .22, .25, .07, .06, .07].map(part => part * contentWidth);
  const wrap = (text: string, w: number, bold = false) => wrapPrintText(text, w - 14, t => measure(t, bold, 12));
  const meta = data.meta;
  const header = [
    name || 'Schedule',
    [meta.projectName, meta.phase, meta.dayNumber == null ? '' : `Day ${meta.dayNumber}${meta.totalDays ? ` of ${meta.totalDays}` : ''}`].filter(Boolean).join(' · '),
    [meta.town, meta.date, data.rows.find(row => !row.sunLocked)?.timeIn ? `Call: ${data.rows.find(row => !row.sunLocked)?.timeIn}` : ''].filter(Boolean).join(' · '),
    [meta.prod && `Producer: ${meta.prod}`, meta.dir && `Director: ${meta.dir}`, meta.dp && `Camera: ${meta.dp}`].filter(Boolean).join(' · '),
    meta.wx ? [meta.wx.sunrise && `Sunrise: ${meta.wx.sunrise}`, meta.wx.sunset && `Sunset: ${meta.wx.sunset}`, meta.wx.cond, meta.wx.maxF == null ? '' : `High: ${meta.wx.maxF}°F`, meta.wx.minF == null ? '' : `Low: ${meta.wx.minF}°F`, meta.wx.prec == null ? '' : `Rain: ${meta.wx.prec}%`].filter(Boolean).join(' · ') : '',
  ].filter(Boolean).flatMap(text => wrap(text, contentWidth - 160));
  const headerHeight = Math.max(90, header.length * LINE + 34);
  const capacity = height - PAD * 2 - headerHeight - FOOTER - TABLE_HEAD;
  if (capacity < LINE * 6) throw new Error('The schedule header is too long to fit this paper size. Shorten the header fields before printing.');
  const pages: Page[] = [{ kind: 'schedule', rows: [], notes: [] }];
  let used = 0;
  const appendix: { ref: string; title: string; text: string }[] = [];
  data.rows.forEach((row, index) => {
    if (!(row.action || row.timeIn || row.notes || row.keyInstruction || row.desc || row.loc)) return;
    const action = row.action === 'Other' ? row.otherText || 'Other' : row.action;
    const detail = (value: string, col: number, ref: string, label: string): Line[] => {
      const lines = wrap(value || '', columns[col]);
      if (mode === 'compact' && lines.length > 3) {
        appendix.push({ ref, title: `${ref} · Row ${index + 1} · ${row.timeIn || 'Time not set'} · ${row.locName || row.loc || action || 'Location not set'} · ${label}`, text: value });
        return [...lines.slice(0, 3).map(text => ({ text })), { text: '', ref }];
      }
      return lines.map(text => ({ text }));
    };
    const loc = [row.locName || row.loc, row.locAddress, ...(row.subLocations || []).flatMap(sl => [sl.name || sl.loc, sl.address, sl.desc])].filter(Boolean).join('\n');
    const notes: Line[] = [
      ...wrap(row.keyInstruction ? `KEY: ${row.keyInstruction}` : '', columns[4], true).map(text => ({ text, bold: true })),
      ...detail(row.notes, 4, `N${index + 1}`, 'Notes'),
    ];
    const cells = [[], wrap(action, columns[1]).map(text => ({ text })), wrap(loc, columns[2]).map(text => ({ text })), detail(row.desc, 3, `D${index + 1}`, 'Description'), notes, wrap(row.timeIn, columns[5]).map(text => ({ text })), wrap(row.dur, columns[6]).map(text => ({ text })), wrap(computeTimeOut(row), columns[7]).map(text => ({ text }))];
    const totalLines = Math.max(1, ...cells.map(cell => cell.length));
    const rowHeight = totalLines * LINE + ROW_PAD;
    if (used && rowHeight <= capacity && used + rowHeight > capacity) { pages.push({ kind: 'schedule', rows: [], notes: [] }); used = 0; }
    let offset = 0;
    while (offset < totalLines) {
      let available = Math.floor((capacity - used - ROW_PAD) / LINE);
      if (available < 1) { pages.push({ kind: 'schedule', rows: [], notes: [] }); used = 0; available = Math.floor((capacity - ROW_PAD) / LINE); }
      const count = Math.min(available, totalLines - offset);
      pages[pages.length - 1].rows.push({ number: index + 1, continued: offset > 0, cells: cells.map(cell => cell.slice(offset, offset + count)) });
      used += count * LINE + ROW_PAD;
      offset += count;
    }
  });
  const schedulePages = pages.length;
  const references: Record<string, number> = {};
  used = capacity;
  for (const note of appendix) {
    const title = wrap(note.title, contentWidth, true);
    const lines = wrap(note.text, contentWidth);
    let offset = 0;
    while (offset < lines.length) {
      const overhead = title.length * LINE + 24 + (offset > 0 ? 12 : 0);
      if (capacity - used < overhead + LINE * 2) { pages.push({ kind: 'notes', rows: [], notes: [] }); used = 0; }
      const count = Math.floor((capacity - used - overhead) / LINE);
      if (count < 1) throw new Error('A notes heading is too long to fit. Shorten its location name before printing.');
      references[note.ref] ??= pages.length;
      const block = { ref: note.ref, title, lines: lines.slice(offset, offset + count), continued: offset > 0 };
      pages[pages.length - 1].notes.push(block);
      used += overhead + block.lines.length * LINE;
      offset += block.lines.length;
    }
  }
  return { totalDuration: mDur(data.rows.reduce((sum, row) => sum + (row.sunLocked ? 0 : durm(row.dur)), 0)) || '00:00', pages, schedulePages, notesPages: pages.length - schedulePages, references, header, name, width, height, columns, contentWidth, headerHeight, mode, paper };
}

export function escapePrintHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
export function renderSchedulePrint(layout: PrintLayout, logoUrl = ''): string {
  const esc = escapePrintHtml;
  const lines = (items: string[]) => items.map(text => `<span class="line">${esc(text) || '&nbsp;'}</span>`).join('');
  const header = `<header>${lines(layout.header)}${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="Organization logo">` : ''}</header>`;
  const heads = ['#', 'Action', 'Location', 'Description', 'Notes / key instruction', 'Time in', 'Duration', 'Time out'];
  const cols = layout.columns.map(width => `<col style="width:${width}px">`).join('');
  const pageHtml = layout.pages.map((page, index) => `<section class="paper" data-kind="${page.kind}">${header}
    <h2>${page.kind === 'notes' ? 'Schedule Notes' : 'Production Schedule'}</h2>
    ${page.kind === 'schedule' ? `<table><colgroup>${cols}</colgroup><thead><tr>${heads.map(text => `<th>${text}</th>`).join('')}</tr></thead><tbody>${page.rows.map(row => `<tr><td>${row.number}${row.continued ? '*' : ''}</td>${row.cells.slice(1).map(cell => `<td>${cell.map(line => line.ref ? `<a class="line reference" href="#${line.ref}">Full ${line.ref.startsWith('D') ? 'description' : 'notes'}: ${line.ref}, page ${layout.references[line.ref]}</a>` : `<span class="line${line.bold ? ' key' : ''}">${esc(line.text) || '&nbsp;'}</span>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : page.notes.map(note => `<article${note.continued ? '' : ` id="${note.ref}"`}><h3>${lines(note.title)}${note.continued ? '<span class="continued-label">(continued)</span>' : ''}</h3><div>${lines(note.lines)}</div></article>`).join('')}
    <footer><span>${page.kind === 'schedule' ? `Total ${layout.totalDuration} · ` : ''}${layout.mode === 'compact' ? 'Compact schedule + full notes' : 'All details inline'}${layout.pages.some(p => p.rows.some(r => r.continued)) ? ' · * Continued row' : ''}${page.kind === 'schedule' && layout.notesPages ? ` · Full supporting notes on ${layout.notesPages === 1 ? `page ${layout.pages.length}` : `pages ${layout.schedulePages + 1}-${layout.pages.length}`}` : ''}</span><span>Page ${index + 1} of ${layout.pages.length}</span></footer></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(layout.name || 'Schedule')}</title><style>
    @page { size: ${layout.paper === 'a4' ? 'A4' : 'letter'} landscape; margin: 0; }
    *{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#171717;background:#e9eaed}
    .paper{position:relative;background:white;width:${layout.width}px;height:${layout.height}px;padding:${PAD}px;margin:16px auto;break-after:page;page-break-after:always}
    .paper:last-child{break-after:auto;page-break-after:auto}header{height:${layout.headerHeight - 28}px;line-height:${LINE}px}header .line:first-child{font-weight:bold;color:#a81466}.logo{position:absolute;right:34px;top:34px;width:140px;height:64px;object-fit:contain}
    h2{height:28px;line-height:20px;margin:0;font-size:17px;font-weight:bold}table{border-collapse:collapse;table-layout:fixed;width:${layout.contentWidth}px}thead{height:${TABLE_HEAD}px}th{background:#191919;color:white;text-align:left;font-size:10px;padding:6px;line-height:14px}
    td{vertical-align:top;padding:6px;border-bottom:2px solid #e8e8e8;line-height:${LINE}px}tbody tr:nth-child(odd){background:#fcf4f8}.line{display:block;white-space:pre;height:${LINE}px;line-height:${LINE}px}.key{font-weight:bold}.reference{font-size:10px;color:#7b124b;text-decoration:underline}.continuation{display:block;font-size:8px;line-height:10px}
    article{padding:0 7px;margin:0 0 24px}h3{position:relative;font-size:12px;line-height:${LINE}px;margin:0;font-weight:bold}.continued-label{display:block;height:12px;line-height:12px;font-size:10px}
    footer{position:absolute;bottom:${PAD}px;left:${PAD}px;right:${PAD}px;height:20px;border-top:1px solid #bbb;padding-top:7px;display:flex;justify-content:space-between;font-size:10px}
    @media print{html,body{background:white}.paper{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${pageHtml}</body></html>`;
}
