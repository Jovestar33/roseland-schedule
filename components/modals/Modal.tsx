'use client';
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Retained local panels can hide portals without discarding their form state. */
export const ModalVisibilityContext = createContext(true);

// Only the frontmost visible modal owns keyboard focus. A nested native dialog
// already has a browser focus scope and must not be intercepted here.
const openModals: {node: HTMLDivElement; layer: number}[] = [];
const focusable = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';
function canFocus(node: HTMLElement) {
  return !node.matches(':disabled, [hidden], [inert]') && !node.closest('[inert]') &&
    node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
}

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const shown = open && visible;
  const previousShown = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  // Capture before React commits descendant autoFocus controls. A passive effect
  // would observe the new form field rather than the button that opened it.
  if (shown && !previousShown.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  previousShown.current = shown;
  useEffect(() => {
    const current = dialogRef.current;
    if (!open || !visible || !current) return;
    const node: HTMLDivElement = current;
    const opener = openerRef.current;
    const entry = { node, layer: zIndex ?? (Number(getComputedStyle(node.parentElement!).zIndex) || 0) };
    openModals.push(entry);
    const ownsFocus = () => {
      const front = [...openModals].sort((a,b) => a.layer-b.layer).at(-1);
      const native = document.querySelector('dialog:modal');
      return front === entry && (!native || node.contains(native));
    };
    const candidates = () => [...node.querySelectorAll<HTMLElement>(focusable)]
      .filter(element => element.tabIndex >= 0 && canFocus(element));
    function onKey(event: KeyboardEvent) {
      if (!ownsFocus() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();
      } else if (event.key === 'Tab') {
        const items = candidates(), first = items[0], last = items.at(-1);
        const focused = document.activeElement;
        if (!first) { event.preventDefault(); node.focus(); }
        else if (event.shiftKey && (focused === first || focused === node || !node.contains(focused))) {
          event.preventDefault(); last!.focus();
        } else if (!event.shiftKey && (focused === last || focused === node || !node.contains(focused))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    function onFocus(event: FocusEvent) {
      if (ownsFocus() && !node.contains(event.target as Node)) node.focus({preventScroll:true});
    }
    if (ownsFocus() && !node.contains(document.activeElement)) node.focus({preventScroll:true});
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      const wasFront = ownsFocus();
      openModals.splice(openModals.indexOf(entry), 1);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      if (wasFront && opener?.isConnected && canFocus(opener)) opener.focus({preventScroll:true});
    };
  }, [open, visible, zIndex]);

  if (!open || (!visible && !retainWhenHidden) || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="overlay open"
      style={{ zIndex, display: visible ? undefined : 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`modal ${className ?? ''}`} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mhdr">
          <h2 id={titleId}>{title}</h2>
          <button className="mclose" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mbody">{children}</div>
        {footer && <div className="mfoot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
