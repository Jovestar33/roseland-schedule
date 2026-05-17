'use client';
import { useState, useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function LibrarySearch({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function clear() { setDraft(''); onChange(''); }

  return (
    <div className="lib-search-wrap">
      <span className="lib-search-icon">⌕</span>
      <input
        className="lib-search-input"
        type="text"
        placeholder="Search schedules…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft && (
        <button className="lib-search-clear" onClick={clear} title="Clear search">✕</button>
      )}
    </div>
  );
}
