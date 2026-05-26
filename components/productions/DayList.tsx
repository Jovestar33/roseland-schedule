'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProductionStore } from '@/lib/store/productionStore';
import DayFormModal from './DayFormModal';
import type { Production, ProductionDay, ProductionDayType } from '@/lib/types';

const TYPE_LABELS: Record<ProductionDayType, string> = {
  shoot:    'Shoot',
  prep:     'Prep',
  travel:   'Travel',
  hold:     'Hold',
  wrap:     'Wrap',
  edit:     'Edit',
  delivery: 'Delivery',
  custom:   'Custom',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function newId() {
  return crypto.randomUUID();
}

interface Props {
  production: Production;
  scheduleNames?: string[];
}

export default function DayList({ production, scheduleNames = [] }: Props) {
  const router = useRouter();
  const allDays    = useProductionStore((s) => s.days);
  const days       = useMemo(
    () =>
      allDays
        .filter((d) => d.productionId === production.id)
        .sort((a, b) => {
          if (a.date && b.date) return a.date.localeCompare(b.date);
          if (a.date) return -1;
          if (b.date) return 1;
          return a.sortOrder - b.sortOrder;
        }),
    [allDays, production.id],
  );
  const upsertDay  = useProductionStore((s) => s.upsertDay);
  const removeDay  = useProductionStore((s) => s.removeDay);

  const [formOpen,    setFormOpen]    = useState(false);
  const [editingDay,  setEditingDay]  = useState<ProductionDay | null>(null);

  function openAdd() { setEditingDay(null); setFormOpen(true); }
  function openEdit(d: ProductionDay) { setEditingDay(d); setFormOpen(true); }

  async function handleSave(
    payload: Omit<ProductionDay, 'id' | 'productionId' | 'sortOrder'> & { id?: string }
  ) {
    const id = payload.id ?? newId();
    const sortOrder = payload.id
      ? (days.find((d) => d.id === id)?.sortOrder ?? days.length)
      : days.length;
    await upsertDay({
      id,
      productionId: production.id,
      sortOrder,
      type: payload.type,
      status: payload.status,
      date: payload.date,
      typeLabel: payload.typeLabel,
      title: payload.title,
      locationSummary: payload.locationSummary,
      linkedScheduleName: payload.linkedScheduleName,
      notes: payload.notes,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this day?')) return;
    await removeDay(id);
  }

  function handleOpenSchedule(name: string) {
    router.push(`/schedule/${encodeURIComponent(name)}?openCallSheet=1`);
  }

  return (
    <div>
      <div className="pc-day-list">
        {days.length === 0 && (
          <p className="pc-day-empty">No days yet. Add the first one below.</p>
        )}
        {days.map((d) => (
          <DayRow
            key={d.id}
            day={d}
            onEdit={() => openEdit(d)}
            onDelete={() => handleDelete(d.id)}
            onOpenSchedule={d.linkedScheduleName ? () => handleOpenSchedule(d.linkedScheduleName!) : undefined}
          />
        ))}
      </div>

      <div className="pc-day-add-row">
        <button className="btn btn-light btn-sm" onClick={openAdd}>+ Add day</button>
      </div>

      <DayFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        initial={editingDay}
        scheduleNames={scheduleNames}
      />
    </div>
  );
}

interface RowProps {
  day: ProductionDay;
  onEdit: () => void;
  onDelete: () => void;
  onOpenSchedule?: () => void;
}

function DayRow({ day: d, onEdit, onDelete, onOpenSchedule }: RowProps) {
  const typeClass = `pc-type-${d.type}`;
  const typeText  = d.type === 'custom' ? (d.typeLabel || 'Custom') : TYPE_LABELS[d.type];

  const rowClass = [
    'pc-day-row',
    d.status === 'cancelled' ? 'cancelled' : '',
    d.status === 'completed' ? 'completed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClass}>
      <div className="pc-day-date">{formatDate(d.date)}</div>
      <div className="pc-day-type-wrap">
        <span className={`pc-type-badge ${typeClass}`}>{typeText}</span>
      </div>
      <div className="pc-day-body">
        {d.title && <div className="pc-day-title">{d.title}</div>}
        {d.linkedScheduleName && (
          <div className="pc-day-schedule">{d.linkedScheduleName}</div>
        )}
        {d.locationSummary && <div className="pc-day-loc">{d.locationSummary}</div>}
      </div>
      <div className="pc-day-status-col">
        <span className={`pc-status-text ${d.status}`}>{statusLabel(d.status)}</span>
      </div>
      <div className="pc-day-actions">
        {onOpenSchedule && (
          <button className="pc-day-btn pc-day-btn-open" onClick={onOpenSchedule}>
            Call Sheet
          </button>
        )}
        <button className="pc-day-btn" onClick={onEdit}>Edit</button>
        <button className="pc-day-btn pc-day-btn-del" onClick={onDelete}>Del</button>
      </div>
    </div>
  );
}

function statusLabel(s: ProductionDay['status']): string {
  switch (s) {
    case 'tbc':       return 'TBC';
    case 'confirmed': return 'Confirmed';
    case 'tentative': return 'Tentative';
    case 'cancelled': return 'Cancelled';
    case 'completed': return 'Completed';
    default:          return '';
  }
}
