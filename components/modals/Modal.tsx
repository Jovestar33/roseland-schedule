'use client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Retained local panels can hide portals without discarding their form state. */
export const ModalVisibilityContext = createContext(true);

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  zIndex?: number;
  retainWhenHidden?: boolean;
}

export default function Modal({ open, onClose, title, children, footer, className, zIndex, retainWhenHidden = false }: ModalProps) {
  const visible = useContext(ModalVisibilityContext);
  useEffect(() => {
    if (!open || !visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, visible, onClose]);

  if (!open || (!visible && !retainWhenHidden) || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="overlay open"
      style={{ zIndex, display: visible ? undefined : 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`modal ${className ?? ''}`} role="dialog" aria-modal="true">
        <div className="mhdr">
          <h2>{title}</h2>
          <button className="mclose" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mbody">{children}</div>
        {footer && <div className="mfoot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
