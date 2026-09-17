import type { ScheduleRow } from './types.ts';

export interface ContactContext { timeIn: string; action: string; loc: string; desc: string }
export interface DocumentContact { name: string; title: string; phone: string; email: string; rows: ContactContext[] }

/** Group only identical contact values; two titles/emails must not be lost. */
export function documentContacts(rows: ScheduleRow[]): DocumentContact[] {
  const contacts = new Map<string, DocumentContact>();
  for (const row of rows) {
    if (row.sunLocked) continue;
    const values = [row.contactName, row.contactTitle, row.contactPhone, row.contactEmail].map(v => v ?? '');
    if (!values.some(v => v.trim())) continue;
    const key = JSON.stringify(values);
    // Match the existing Contact Sheet's row-location context; nested schedule
    // details belong to schedule print, not this contact document.
    const context = { timeIn: row.timeIn, action: row.action === 'Other' ? row.otherText || 'Other' : row.action, loc: row.loc, desc: row.desc };
    const existing = contacts.get(key);
    if (existing) existing.rows.push(context);
    else contacts.set(key, { name: values[0], title: values[1], phone: values[2], email: values[3], rows: [context] });
  }
  return [...contacts.values()];
}

export function safeDownloadName(value: string, suffix: string): string {
  const stem = value.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-').replace(/^\.+|[. ]+$/g, '').trim().slice(0, 100);
  return `${stem || 'Schedule'}-${suffix}`;
}

export function contactsCsv(contacts: DocumentContact[]): string {
  const rows = [['Name', 'Title', 'Phone', 'Email', 'Time In', 'Action', 'Location', 'Description'],
    ...contacts.flatMap(c => c.rows.map(r => [c.name, c.title, c.phone, c.email, r.timeIn, r.action, r.loc, r.desc]))];
  const escape = (value: string) => {
    // Quoting alone does not stop spreadsheet formulas, including whitespace prefixes.
    const literal = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${literal.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}
