'use client';
import { useState, useRef } from 'react';
import { getCrewSuggestions, saveCrewSuggestion } from '@/lib/crewSuggestions';

type CrewField = 'prod' | 'dir' | 'dp';

interface Props {
  field: CrewField;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

export default function CrewInput({ field, value, onChange, placeholder, id }: Props) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const ignoreBlur = useRef(false);

  function getSuggested(): string[] {
    const all = getCrewSuggestions(field);
    if (!value.trim()) return all;
    const lower = value.toLowerCase();
    return all.filter(s => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower);
  }

  const suggestions = open ? getSuggested() : [];

  function handleFocus() {
    setOpen(true);
    setFocused(0);
  }

  function handleBlur() {
    if (!ignoreBlur.current) {
      setOpen(false);
      if (value.trim()) saveCrewSuggestion(field, value);
    }
  }

  function handleSelect(s: string) {
    onChange(s);
    saveCrewSuggestion(field, s);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter' && suggestions[focused]) { e.preventDefault(); handleSelect(suggestions[focused]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="ac-wrap">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <div className={`ac-dropdown${open && suggestions.length > 0 ? ' open' : ''}`}>
        {suggestions.map((s, i) => (
          <div
            key={s}
            className={`ac-item${i === focused ? ' focused' : ''}`}
            onMouseDown={() => { ignoreBlur.current = true; }}
            onMouseUp={() => { ignoreBlur.current = false; handleSelect(s); }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
