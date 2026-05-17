'use client';
import { useState } from 'react';
import type { DistributionContact } from '@/lib/types';
import { sendSheet } from '@/lib/api/sheets';

interface Props {
  distributionList: DistributionContact[];
  scheduleName: string;
  scheduleDate: string;
  contactSheetUrl?: string;
  callSheetUrl?: string;
  editorToken: string;
  onClose: () => void;
}

export default function SendModal({
  distributionList, scheduleName, scheduleDate,
  contactSheetUrl, callSheetUrl, editorToken, onClose,
}: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipients = distributionList.filter((c) => c.email.trim());

  async function handleSend() {
    if (recipients.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await sendSheet(
        {
          to: recipients.map((c) => c.email.trim()),
          scheduleName,
          scheduleDate,
          contactSheetUrl,
          callSheetUrl,
        },
        editorToken,
      );
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sheet-send-modal-overlay" onClick={onClose}>
      <div className="sheet-send-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-send-modal-title">
          {sent ? 'Sent!' : 'Send Documents'}
        </div>

        {!sent ? (
          <>
            {recipients.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--g500)', margin: 0 }}>
                No recipients with email addresses found in the distribution list.
                Add contacts in the Contact Sheet editor.
              </p>
            ) : (
              <div className="sheet-send-recipient-list">
                {recipients.map((c, i) => (
                  <div className="sheet-send-recipient" key={i}>
                    <span className="sheet-send-recipient-name">{c.name || c.email}</span>
                    {c.name && <span>{c.email}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="sheet-send-links">
              <div style={{ marginBottom: 4 }}>
                <span className="sheet-send-link-label">Links included:</span>
              </div>
              {contactSheetUrl && (
                <div>Contact Sheet: <span style={{ color: 'var(--pink)' }}>✓</span></div>
              )}
              {callSheetUrl && (
                <div>Call Sheet: <span style={{ color: 'var(--pink)' }}>✓</span></div>
              )}
              {!contactSheetUrl && !callSheetUrl && (
                <div style={{ color: 'var(--g400)' }}>No links configured</div>
              )}
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
            )}

            <div className="sheet-send-modal-actions">
              <button className="btn btn-light btn-sm" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button
                className="btn btn-pink btn-sm"
                onClick={handleSend}
                disabled={sending || recipients.length === 0}
              >
                {sending ? 'Sending…' : `Send to ${recipients.length}`}
              </button>
            </div>
          </>
        ) : (
          <div className="sheet-send-modal-actions">
            <button className="btn btn-pink btn-sm" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
