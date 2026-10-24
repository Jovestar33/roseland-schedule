'use client';
import { createPortal } from 'react-dom';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import Modal from './Modal';
import ProductionContacts,{ProductionContactGroups} from '@/components/local/ProductionContacts';
import { documentContacts, contactsCsv, safeDownloadName, type DocumentContact } from '@/lib/document-tools';
import { printDocument } from '@/lib/print';
import DocumentPrintFurniture from './DocumentPrintFurniture';
import { dateLabel } from '@/lib/date-label';
import { useCallback, useContext, useState } from 'react';
import { ModalVisibilityContext } from './Modal';
import { useLocalEditor } from '@/components/schedule/LocalEditorContext';
import {useDocumentOutput} from './useDocumentOutput';

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
              <span className="cs-title"><b>Role / title</b> {c.title||'Not specified'}</span>
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
  readOnly?: boolean;
  open: boolean;
  onClose: () => void;
}

export default function ContactSheetModal({ open, onClose, authorizeOutput, readOnly=false }: Props) {
  const rows         = useScheduleStore((s) => s.rows);
  const scheduleName = useScheduleStore((s) => s.scheduleName) ?? '';
  const meta         = useScheduleStore((s) => s.meta);
  const documentSession = useScheduleStore((s) => s.documentSession);

  const contacts = documentContacts(rows);
  const visible = useContext(ModalVisibilityContext);
  const local = useLocalEditor();
  const output=useDocumentOutput({open,visible,identity:`${documentSession}:${scheduleName}`,authorize:authorizeOutput});
  const [contactState,setContactState]=useState({dirty:false,busy:false});
  const [closeNotice,setCloseNotice]=useState(false);
  const reportContacts=useCallback((dirty:boolean,busy:boolean)=>setContactState({dirty,busy}),[]);
  const productionContacts=local?(meta.productionContacts??[]):[];
  const exportContacts:DocumentContact[]=[...productionContacts.map(c=>({name:c.name,title:c.role,phone:c.phone,email:c.email,rows:[],type:c.type,callTime:c.callTime,department:c.department,reportTo:c.reportTo})),...contacts];

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
        onClose={()=>{output.cancel();onClose();}}
        title="Contact Sheet"
        className="cs-modal"
        retainWhenHidden={local}
        beforeClose={()=>{if(local&&(contactState.dirty||contactState.busy)){setCloseNotice(true);return false;}return true;}}
        footer={
          <>
            <button
              type="button"
              className="btn btn-light btn-sm"
              disabled={output.busy}
              onClick={()=>void output.run(current=>printDocument(scheduleName,'contacts',local,current))}
            >
              🖨 Print
            </button>
            <button
              type="button"
              className="btn btn-light btn-sm"
              disabled={output.busy}
              onClick={()=>void output.run(()=>downloadCsv(exportContacts,scheduleName))}
            >
              ⬇ Download CSV
            </button>
            {output.busy&&<span role="status">Preparing document…</span>}
            {output.error&&<p role="alert">{output.error}</p>}
          </>
        }
      >
        <div className="cs-subtitle">
          <h1 className="cs-sched-name">{scheduleName || 'Contact Sheet'}</h1>
          <span className="cs-date">{formattedDate || 'Date not set'}</span>
          <span className="cs-count">· {contacts.length+productionContacts.length} contact{contacts.length+productionContacts.length !== 1 ? 's' : ''}</span>
        </div>
        {local&&<ProductionContacts readOnly={readOnly} onState={reportContacts} closeNotice={closeNotice}/>}
        {local&&<h2 className="cs-section-heading">Schedule contacts</h2>}<ContactCards contacts={contacts} />
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
          <ProductionContactGroups contacts={productionContacts} showPrivate/>{(contacts.length>0||productionContacts.length===0)&&<>{local&&contacts.length>0&&<h2 className="cs-section-heading">Schedule contacts</h2>}<ContactCards contacts={contacts} print /></>}
        </div>,
        document.body
      )}
    </>
  );
}
