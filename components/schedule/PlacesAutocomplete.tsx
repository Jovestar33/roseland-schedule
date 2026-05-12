'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(0);
  const [rect, setRect]         = useState<DOMRect | null>(null);
  const [mounted, setMounted]   = useState(false);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Keep dropdown anchored to input during scroll / resize
  useEffect(() => {
    if (!open) return;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      console.log('[places] searching:', q);
      const results = await searchPlaces(q);
      console.log('[places] got', results.length, 'results');
      setSuggestions(results);
      if (results.length > 0) {
        setRect(inputRef.current?.getBoundingClientRect() ?? null);
        setOpen(true);
      } else {
        setOpen(false);
      }
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
    if (e.key === 'ArrowDown')   { e.preventDefault(); setFocused(f => Math.min(f + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter' && suggestions[focused]) { e.preventDefault(); handleSelect(suggestions[focused]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  // Render the dropdown via portal so it escapes any overflow:hidden/auto ancestors
  // (tbl-wrap has overflow-x:auto which implicitly clips abs-pos children)
  const dropdown = open && suggestions.length > 0 && mounted && rect
    ? createPortal(
        <div
          className={`${dropdownClass} open`}
          style={{
            position: 'fixed',
            top:   rect.bottom,
            left:  rect.left,
            width: rect.width,
            zIndex: 99999,
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s.placeId || i}
              className={`ac-item${i === focused ? ' focused' : ''}`}
              // preventDefault stops the click from stealing focus (and triggering input blur)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
            >
              <strong>{s.main}</strong>
              {s.sec && <span style={{ color: 'var(--g500)', marginLeft: '4px' }}>{s.sec}</span>}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => { onFocus?.(); }}
        onBlur={() => setOpen(false)}
      />
      {dropdown}
    </>
  );
}
