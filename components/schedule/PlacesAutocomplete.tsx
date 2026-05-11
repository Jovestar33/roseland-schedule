'use client';
import { useState, useRef, useCallback } from 'react';
import { searchPlaces, geocodePlace, type PlaceSuggestion, type GeoResult } from '@/lib/googlePlaces';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string, geo: GeoResult | null) => void;
  onFocus?: () => void;
  placeholder?: string;
  id?: string;
  className?: string;
  dropdownClass?: string;
}

export default function PlacesAutocomplete({
  value,
  onChange,
  onSelect,
  onFocus,
  placeholder,
  id,
  className,
  dropdownClass = 'ac-dropdown',
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBlur = useRef(false);

  const search = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      const results = await searchPlaces(q);
      setSuggestions(results);
      setOpen(results.length > 0);
      setFocused(0);
    }, 220);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    search(v);
  }

  async function handleSelect(s: PlaceSuggestion) {
    setOpen(false);
    setSuggestions([]);
    onChange(s.main || s.label);
    if (onSelect) {
      const geo = await geocodePlace(s.placeId, s.main || s.label);
      onSelect(geo?.address || s.label, geo);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter' && suggestions[focused]) { e.preventDefault(); handleSelect(suggestions[focused]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <>
      <input
        id={id}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => { onFocus?.(); }}
        onBlur={() => {
          if (!ignoreBlur.current) setOpen(false);
        }}
      />
      <div className={`${dropdownClass}${open ? ' open' : ''}`}>
        {suggestions.map((s, i) => (
          <div
            key={s.placeId}
            className={`ac-item${i === focused ? ' focused' : ''}`}
            onMouseDown={() => { ignoreBlur.current = true; }}
            onMouseUp={() => { ignoreBlur.current = false; handleSelect(s); }}
          >
            <strong>{s.main}</strong>
            {s.sec && <span style={{ color: 'var(--g500)', marginLeft: '4px' }}>{s.sec}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
