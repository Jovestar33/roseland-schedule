'use client';
import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const BG: Record<ToastType, string> = {
  success: '#166534',
  error: '#9d1468',
  info: '#1d4ed8',
};

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      onClick={() => onDismiss(toast.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        borderRadius: '6px',
        background: BG[toast.type],
        color: '#fff',
        fontSize: '14px',
        fontFamily: 'var(--fb)',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {toast.message}
    </div>
  );
}
