'use client';
import type { ReactNode } from 'react';

interface Props {
  onRemove: () => void;
  children: ReactNode;
  columns?: string;
}

export default function RepeatableRow({ onRemove, children, columns }: Props) {
  return (
    <div className="repeatable-item">
      <div
        className="repeatable-item-fields"
        style={columns ? { gridTemplateColumns: columns } : undefined}
      >
        {children}
      </div>
      <button className="repeatable-remove" onClick={onRemove} title="Remove" type="button">
        ✕
      </button>
    </div>
  );
}
