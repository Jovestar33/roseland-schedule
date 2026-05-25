'use client';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import Modal from './Modal';
import type { ScheduleRow } from '@/lib/types';

interface RowCtx {
  timeIn: string;
  action: string;
  loc: string;
  desc: string;
}

interface ContactEntry {
  name: string;
  title: string;
  phone: string;
  email: string;
  rows: RowCtx[];
}

function extractContacts(rows: ScheduleRow[]): ContactEntry[] {
  const map = new Map<string, ContactEntry>();
  for (const row of rows) {
    if (row.sunLocked) continue;
    const { contactName, contactTitle, contactPhone, contactEmail } = row;
    if (!contactName && !contactPhone && !contactEmail) continue;
    // Deduplicate by exact name + phone pair (null-byte separator prevents collisions)
    const key = `${contactName.trim()}\0${contactPhone.trim()}`;
    const ctx: RowCtx = {
      timeIn: row.timeIn,
      action: row.action === 'Other' ? (row.otherText || 'Other') : row.action,
      loc: row.loc,
      desc: row.desc,
    };
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(ctx);
    } else {
      map.set(key, {
        name: contactName.trim(),
        title: contactTitle.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim(),
        rows: [ctx],
      });
    }
  }
  return Array.from(map.values());
}

function downloadCsv(contacts: ContactEntry[], scheduleName: string) {
  const headers = ['Name', 'Title', 'Phone', 'Email', 'Time In', 'Action', 'Location', 'Description'];
  const lines: string[][] = [];
  for (const c of contacts) {
    for (const r of c.rows) {
      lines.push([c.name, c.title, c.phone, c.email, r.timeIn, r.action, r.loc, r.desc]);
    }
  }
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...lines].map(row => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${scheduleName || 'Schedule'} – Contacts – ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function handlePrint(scheduleName: string) {
  const prev = document.title;
  document.title = `${scheduleName || 'Schedule'} – Contacts – ${new Date().toISOString().slice(0, 10)}`;
  document.body.classList.add('cs-printing');
  window.addEventListener('afterprint', function cleanup() {
    document.body.classList.remove('cs-printing');
    document.title = prev;
    window.removeEventListener('afterprint', cleanup);
  });
  window.print();
}

// Shared card list — rendered both inside the modal and in the print-only clone.
function ContactCards({ contacts }: { contacts: ContactEntry[] }) {
  if (contacts.length === 0) {
    return (
      <p className="empty cs-empty">
        No contacts found. Add contacts using the 👤 button on any row.
      </p>
    );
  }
  return (
    <div className="cs-list">
      {contacts.map((c, i) => {
        const hasCtx = c.rows.some(r => r.timeIn || r.action || r.loc);
        return (
          <div key={i} className="cs-card">
            <div className="cs-card-head">
              <span className="cs-name">{c.name || <em>Unnamed</em>}</span>
              {c.title && <span className="cs-title">{c.title}</span>}
            </div>
            <div className="cs-contact-row">
              {c.phone && <a href={`tel:${c.phone}`} className="cs-phone">📞 {c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="cs-email">✉ {c.email}</a>}
            </div>
            {hasCtx && (
              <div className="cs-rows">
                {c.rows.map((r, j) =>
                  (r.timeIn || r.action || r.loc) ? (
                    <div key={j} className="cs-row-ctx">
                      {r.timeIn  && <span className="cs-row-time">{r.timeIn}</span>}
                      {r.action  && <span className="cs-row-action">{r.action}</span>}
                      {r.loc     && <span className="cs-row-loc">{r.loc}</span>}
                      {r.desc    && <span className="cs-row-desc">{r.desc}</span>}
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ContactSheetModal({ open, onClose }: Props) {
  const rows         = useScheduleStore((s) => s.rows);
  const scheduleName = useScheduleStore((s) => s.scheduleName) ?? '';
  const meta         = useScheduleStore((s) => s.meta);

  const contacts = extractContacts(rows);

  const formattedDate = meta.date
    ? new Date(meta.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : '';

  return (
    <>
      {/* ── Screen modal ── */}
      <Modal
        open={open}
        onClose={onClose}
        title="Contact Sheet"
        className="cs-modal"
        footer={
          <>
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={() => handlePrint(scheduleName)}
            >
              🖨 Print
            </button>
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={() => downloadCsv(contacts, scheduleName)}
            >
              ⬇ Download CSV
            </button>
          </>
        }
      >
        <div className="cs-subtitle">
          <span className="cs-sched-name">{scheduleName}</span>
          {formattedDate && <span className="cs-date">· {formattedDate}</span>}
          <span className="cs-count">· {contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
        </div>
        <ContactCards contacts={contacts} />
      </Modal>

      {/* ── Print-only clone ──────────────────────────────────────────────
          Rendered directly on document.body — completely outside the modal/
          overlay DOM tree that print.css suppresses. Invisible on screen;
          shown only when body.cs-printing is set during contact sheet print.
          The modal itself stays hidden (print.css handles it as normal).
      ──────────────────────────────────────────────────────────────────── */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="cs-print-only">
          <div className="cs-print-header">
            <div className="cs-print-sched-name">{scheduleName}</div>
            {formattedDate && <div className="cs-print-date">{formattedDate}</div>}
            <h1 className="cs-print-title">Contact Sheet</h1>
          </div>
          <ContactCards contacts={contacts} />
        </div>,
        document.body
      )}
    </>
  );
}
