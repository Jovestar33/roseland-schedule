'use client';
import { useState, useEffect } from 'react';
import Modal from './Modal';
import type { ScheduleRow } from '@/lib/types';

type ContactPatch = Pick<ScheduleRow, 'contactName' | 'contactTitle' | 'contactPhone' | 'contactEmail'>;

interface Props {
  open: boolean;
  row: ScheduleRow | null;
  onSave: (patch: ContactPatch) => void;
  onClose: () => void;
}

const inp: React.CSSProperties = {
  fontFamily: 'var(--fb)',
  fontSize: '14px',
  padding: '8px 10px',
  border: '1.5px solid var(--g200)',
  borderRadius: '7px',
  width: '100%',
  outline: 'none',
};

export default function ContactModal({ open, row, onSave, onClose }: Props) {
  const [name, setName]   = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (row && open) {
      setName(row.contactName);
      setTitle(row.contactTitle);
      setPhone(row.contactPhone);
      setEmail(row.contactEmail);
    }
  }, [row, open]);

  function handleSave() {
    onSave({
      contactName: name.trim(),
      contactTitle: title.trim(),
      contactPhone: phone.trim(),
      contactEmail: email.trim(),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contact"
      className="location-contact-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave}>Save</button>
        </>
      }
    >
      <p className="location-contact-subtitle">
        Location contact, crew member, or booking reference.
      </p>
      <div className="location-contact-grid">
        <div>
          <span className="location-contact-label">Name</span>
          <input autoFocus style={inp} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <span className="location-contact-label">Title / Role</span>
          <input style={inp} placeholder="e.g. Location Manager" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <span className="location-contact-label">Phone</span>
          <input style={inp} type="tel" placeholder="555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <span className="location-contact-label">Email</span>
          <input style={inp} type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      {(phone || email) && (
        <div className="location-contact-actions">
          {phone && (
            <a href={`tel:${phone}`} className="btn btn-light btn-sm">📞 Call</a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="btn btn-light btn-sm">✉ Email</a>
          )}
        </div>
      )}
    </Modal>
  );
}
