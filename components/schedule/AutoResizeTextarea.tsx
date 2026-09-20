'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { observeTextareaSize } from '@/lib/observe-textarea-size';
import styles from './collapsible-text.module.css';

interface Props {
  className?: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  label?: string;
  rows?: number;
}

export default function AutoResizeTextarea({ className, value, onChange, onFocus, placeholder, label = 'Text', rows = 2 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeTextareaSize(el, { rows: 3, expanded, onOverflow: setOverflow });
  }, [value, expanded]);

  return (
    <div className={styles.field}>
      <textarea
        ref={ref}
        id={id}
        aria-label={label}
        className={`${className ?? ''}${expanded ? '' : ` ${styles.compactEditor}`}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { setExpanded(true); onFocus?.(); }}
        placeholder={placeholder}
        rows={rows}
        style={{ overflow: 'hidden', resize: 'none' }}
      />
      {overflow && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={`${expanded ? 'Show less' : 'Show more'} ${label.toLowerCase()}`}
          onClick={() => setExpanded(open => !open)}
        >{expanded ? 'Less' : 'More'}</button>
      )}
    </div>
  );
}
