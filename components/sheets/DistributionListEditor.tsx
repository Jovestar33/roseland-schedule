'use client';
import type { DistributionContact } from '@/lib/types';
import RepeatableRow from './RepeatableRow';

interface Props {
  value: DistributionContact[];
  onChange: (v: DistributionContact[]) => void;
}

function blank(): DistributionContact {
  return { name: '', email: '' };
}

export default function DistributionListEditor({ value, onChange }: Props) {
  function update(i: number, field: keyof DistributionContact, v: string) {
    const next = value.map((row, idx) => idx === i ? { ...row, [field]: v } : row);
    onChange(next);
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="repeatable-list">
      {value.map((row, i) => (
        <RepeatableRow key={i} onRemove={() => remove(i)} columns="1fr 1fr">
          <input
            className="sheet-input"
            placeholder="Name"
            value={row.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <input
            className="sheet-input"
            placeholder="Email"
            type="email"
            value={row.email}
            onChange={(e) => update(i, 'email', e.target.value)}
          />
        </RepeatableRow>
      ))}
      <button className="repeatable-add" type="button" onClick={() => onChange([...value, blank()])}>
        + Add recipient
      </button>
    </div>
  );
}
