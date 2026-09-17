'use client';
import { useState, useEffect, useId } from 'react';
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
  const fieldId = useId();
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
      title="Location Contact"
      className="location-contact-modal"
      footer={
        <>
          <button className="btn btn-light" onClick={() => { window.location.href = `mailto:${email}`; }}>Email</button>
          <button className="btn btn-light" onClick={() => { window.location.href = `tel:${phone}`; }}>Call</button>
          <button className="btn btn-pink" onClick={handleSave}>Save Contact</button>
        </>
      }
    >
      <div className="location-contact-grid">
        <div className="location-contact-full">
          <label className="location-contact-label" htmlFor={fieldId+'-name'}>Name</label>
          <input autoFocus style={inp} type="text" placeholder="Contact name" id={fieldId+'-name'} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="location-contact-full">
          <label className="location-contact-label" htmlFor={fieldId+'-title'}>Title</label>
          <input style={inp} type="text" placeholder="Role / title" id={fieldId+'-title'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="location-contact-full">
          <label className="location-contact-label" htmlFor={fieldId+'-phone'}>Phone</label>
          <input style={inp} type="tel" placeholder="Phone" id={fieldId+'-phone'} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="location-contact-full">
          <label className="location-contact-label" htmlFor={fieldId+'-email'}>Email</label>
          <input style={inp} type="email" placeholder="Email" id={fieldId+'-email'} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
