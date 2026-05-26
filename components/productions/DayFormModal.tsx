'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/modals/Modal';
import type { ProductionDay, ProductionDayType, ProductionDayStatus } from '@/lib/types';

const DAY_TYPES: { value: ProductionDayType; label: string }[] = [
  { value: 'shoot',    label: 'Shoot' },
  { value: 'prep',     label: 'Prep' },
  { value: 'travel',   label: 'Travel' },
  { value: 'hold',     label: 'Hold' },
  { value: 'wrap',     label: 'Wrap' },
  { value: 'edit',     label: 'Edit' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'custom',   label: 'Custom…' },
];

const DAY_STATUSES: { value: ProductionDayStatus; label: string }[] = [
  { value: 'tbc',       label: 'TBC' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (day: Omit<ProductionDay, 'id' | 'productionId' | 'sortOrder'> & { id?: string }) => void;
  initial?: ProductionDay | null;
  scheduleNames?: string[];
}

const blank = (): Omit<ProductionDay, 'id' | 'productionId' | 'sortOrder'> => ({
  date: '',
  type: 'shoot',
  typeLabel: '',
  title: '',
  status: 'tbc',
  locationSummary: '',
  linkedScheduleName: '',
  notes: '',
});

export default function DayFormModal({ open, onClose, onSave, initial, scheduleNames = [] }: Props) {
  const [form, setForm] = useState(blank());

  useEffect(() => {
    if (open) {
      setForm(initial
        ? {
            date: initial.date ?? '',
            type: initial.type,
            typeLabel: initial.typeLabel ?? '',
            title: initial.title ?? '',
            status: initial.status,
            locationSummary: initial.locationSummary ?? '',
            linkedScheduleName: initial.linkedScheduleName ?? '',
            notes: initial.notes ?? '',
          }
        : blank());
    }
  }, [open, initial]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Parameters<typeof onSave>[0] = {
      ...(initial?.id ? { id: initial.id } : {}),
      date: form.date || undefined,
      type: form.type,
      typeLabel: form.type === 'custom' ? (form.typeLabel || undefined) : undefined,
      title: form.title || undefined,
      status: form.status,
      locationSummary: form.locationSummary || undefined,
      linkedScheduleName: form.linkedScheduleName || undefined,
      notes: form.notes || undefined,
    };
    onSave(payload);
    onClose();
  }

  const listId = 'day-form-sched-list';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Day' : 'Add Day'}
      footer={
        <>
          <button className="btn btn-light btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-pink btn-sm" form="day-form" type="submit">Save</button>
        </>
      }
    >
      <form id="day-form" className="pc-form" onSubmit={handleSubmit}>
        <div className="pc-form-row-2col">
          <div className="pc-form-row">
            <label className="pc-form-label">Date</label>
            <input className="pc-form-input" type="date" value={form.date}
              onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="pc-form-row">
            <label className="pc-form-label">Type</label>
            <select className="pc-form-select" value={form.type}
              onChange={(e) => set('type', e.target.value as ProductionDayType)}>
              {DAY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {form.type === 'custom' && (
          <div className="pc-form-row">
            <label className="pc-form-label">Custom type label</label>
            <input className="pc-form-input" value={form.typeLabel}
              onChange={(e) => set('typeLabel', e.target.value)}
              placeholder="e.g. Recce" />
          </div>
        )}

        <div className="pc-form-row-2col">
          <div className="pc-form-row">
            <label className="pc-form-label">Title</label>
            <input className="pc-form-input" value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Day 1 — Studio" />
          </div>
          <div className="pc-form-row">
            <label className="pc-form-label">Status</label>
            <select className="pc-form-select" value={form.status}
              onChange={(e) => set('status', e.target.value as ProductionDayStatus)}>
              {DAY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pc-form-row">
          <label className="pc-form-label">Location</label>
          <input className="pc-form-input" value={form.locationSummary}
            onChange={(e) => set('locationSummary', e.target.value)}
            placeholder="Studio, exterior address, etc." />
        </div>

        <div className="pc-form-row">
          <label className="pc-form-label">Linked schedule</label>
          <input className="pc-form-input" list={listId}
            value={form.linkedScheduleName}
            onChange={(e) => set('linkedScheduleName', e.target.value)}
            placeholder="Type to search or leave blank" />
          {scheduleNames.length > 0 && (
            <datalist id={listId}>
              {scheduleNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          )}
        </div>

        <div className="pc-form-row">
          <label className="pc-form-label">Notes</label>
          <textarea className="pc-form-ta" value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any notes for this day" />
        </div>
      </form>
    </Modal>
  );
}
