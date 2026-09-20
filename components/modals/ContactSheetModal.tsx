'use client';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import Modal from './Modal';
import { documentContacts, contactsCsv, safeDownloadName, type DocumentContact } from '@/lib/document-tools';
import { printDocument } from '@/lib/print';
import DocumentPrintFurniture from './DocumentPrintFurniture';
import { dateLabel } from '@/lib/date-label';
import { useContext } from 'react';
import { ModalVisibilityContext } from './Modal';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';

function downloadCsv(contacts: DocumentContact[], scheduleName: string) {
  const blob = new Blob([contactsCsv(contacts)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = safeDownloadName(scheduleName, 'contacts.csv'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Shared card list — rendered both inside the modal and in the print-only clone.
function ContactCards({ contacts, print = false }: { contacts: DocumentContact[]; print?: boolean }) {
  if (contacts.length === 0) {
    return (
      <p className="empty cs-empty">
        {print ? 'No contacts on this schedule.' : 'No contacts found. Add contacts using the 👤 button on any row.'}
      </p>
    );
  }
  return <div className="cs-list">
    {contacts.map((c, i) => <section key={i} className={`cs-card${c.rows.reduce((n, r) => n + (r.desc?.length ?? 0) + (r.loc?.length ?? 0) + (r.action?.length ?? 0) + 120, 0) > 2200 ? ' cs-card-long' : ''}`} aria-label={c.name || 'Unnamed contact'}>
      <table className="cs-contact-table">
        <colgroup><col className="cs-time-col" /><col /></colgroup>
        <thead><tr><th colSpan={2} scope="colgroup">
          <div className="cs-identity">
            <div className="cs-card-head"><span className="cs-name">{c.name || 'Unnamed'}</span>
              {c.title && <span className="cs-title">{c.title}</span>}
            </div>
            <div className="cs-contact-row">
              {c.phone && <a href={`tel:${c.phone}`} className="cs-phone">{c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="cs-email">{c.email}</a>}
            </div>
          </div>
        </th></tr></thead>
        <tbody>{c.rows.map((r, j) => (r.timeIn || r.action || r.loc || r.desc) ?
          <tr key={j} className="cs-row-ctx">
            <td className="cs-row-time">{r.timeIn}</td>
            <td className="cs-assignment">
              {r.action && <span className="cs-row-action">{r.action}</span>}
              {r.loc && <span className="cs-row-loc">{r.loc}</span>}
              {r.desc && <span className="cs-row-desc">{r.desc}</span>}
            </td>
          </tr> : null)}</tbody>
      </table>
    </section>)}
  </div>;
}

interface Props {
  authorizeOutput?:()=>Promise<boolean>;
  open: boolean;
  onClose: () => void;
}

export default function ContactSheetModal({ open, onClose, authorizeOutput }: Props) {
  const rows         = useScheduleStore((s) => s.rows);
  const scheduleName = useScheduleStore((s) => s.scheduleName) ?? '';
  const meta         = useScheduleStore((s) => s.meta);

  const contacts = documentContacts(rows);
  const visible = useContext(ModalVisibilityContext);
  const local = useLocalEditor();

  const formattedDate = dateLabel(meta.date) !== 'Date not set'
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
              onClick={async()=>{if(!authorizeOutput||await authorizeOutput())void printDocument(scheduleName,'contacts',local);}}
            >
              🖨 Print
            </button>
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={async()=>{if(!authorizeOutput||await authorizeOutput())downloadCsv(contacts,scheduleName);}}
            >
              ⬇ Download CSV
            </button>
          </>
        }
      >
        <div className="cs-subtitle">
          <h1 className="cs-sched-name">{scheduleName || 'Contact Sheet'}</h1>
          <span className="cs-date">{formattedDate || 'Date not set'}</span>
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
      {open && visible && typeof document !== 'undefined' && createPortal(
        <div className="cs-print-only">
          <DocumentPrintFurniture name={scheduleName} date={formattedDate} kind="Contact Sheet" />
          <div className="cs-print-header">
            <div className="cs-print-sched-name">{scheduleName}</div>
            {formattedDate && <div className="cs-print-date">{formattedDate}</div>}
            <h1 className="cs-print-title">Contact Sheet</h1>
          </div>
          <ContactCards contacts={contacts} print />
        </div>,
        document.body
      )}
    </>
  );
}
