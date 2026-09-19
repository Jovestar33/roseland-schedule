'use client';
import { useEffect, useRef } from 'react';
import {observeTextareaSize} from '@/lib/observe-textarea-size';

interface Props {
  className?: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  rows?: number;
}

export default function AutoResizeTextarea({ className, value, onChange, onFocus, placeholder, rows = 2 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeTextareaSize(el);
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      rows={rows}
      style={{ overflow: 'hidden', resize: 'none' }}
    />
  );
}
