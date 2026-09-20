'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import styles from './collapsible-text.module.css';

/** Compact on screen; the complete saved text always remains available in print. */
export default function CollapsibleText({ value, label }: { value: string; label: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !el.clientWidth) return;
      setOverflow(el.scrollHeight > parseFloat(getComputedStyle(el).lineHeight) * 3 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const fonts = el.ownerDocument.fonts;
    void fonts?.ready.then(measure);
    fonts?.addEventListener('loadingdone', measure);
    return () => { disposed = true; observer.disconnect(); fonts?.removeEventListener('loadingdone', measure); };
  }, [value]);
  return (
    <div className={styles.field}>
      <div ref={ref} id={id} className={`${styles.preview}${expanded ? '' : ` ${styles.collapsed}`}`}>{value}</div>
      {overflow && <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={id}
        aria-label={`${expanded ? 'Show less' : 'Show more'} ${label.toLowerCase()}`}
        onClick={() => setExpanded(open => !open)}>{expanded ? 'Less' : 'More'}</button>}
    </div>
  );
}
