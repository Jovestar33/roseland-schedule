'use client';
import { useState } from 'react';

export interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onEscape?: () => void;
  options: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  showAllOnOpen?: boolean;
}

function titleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ComboInput({
  value, onChange, onBlur, onEscape, options, placeholder, className, autoFocus,
  showAllOnOpen = false,
}: ComboInputProps) {
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [typed,     setTyped]     = useState(false);

  const filtered = [...options]
    .filter((o) => {
      if (!value) return true;
      if (showAllOnOpen && !typed) return true;
      return o.toLowerCase().includes(value.toLowerCase());
    })
    .sort((a, b) => a.localeCompare(b));

  const showDropdown = open && filtered.length > 0;

  function selectOption(opt: string) {
    onChange(opt);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && activeIdx >= 0) {
        selectOption(filtered[activeIdx]);
      } else {
        setOpen(false);
      }
      onBlur?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      onEscape?.();
    }
  }

  function handleBlur() {
    setOpen(false);
    setActiveIdx(-1);
    // Normalize then hand off to parent's commit — parent also normalizes,
    // but calling onChange here ensures the draft reflects the final value
    // before the parent's onBlur/commit reads it.
    const normalized = titleCase(value);
    if (normalized !== value) onChange(normalized);
    onBlur?.();
  }

  return (
    <div className="combo-wrap">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setTyped(true); setActiveIdx(-1); }}
        onFocus={() => { setOpen(true); setTyped(false); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <div className="combo-dropdown" role="listbox">
          {filtered.map((opt, i) => (
            <button
              key={opt}
              role="option"
              aria-selected={i === activeIdx}
              className={`combo-option${i === activeIdx ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
