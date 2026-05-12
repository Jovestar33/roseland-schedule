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
  multiline?: boolean;
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
  multiline = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(0);
  const [rect, setRect]         = useState<DOMRect | null>(null);
  const [mounted, setMounted]   = useState(false);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Single ref works for both input and textarea via callback ref pattern
  const elementRef   = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Auto-resize textarea when value changes
  useEffect(() => {
    if (!multiline || !elementRef.current) return;
    const el = elementRef.current as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  // Keep dropdown anchored during scroll / resize
  useEffect(() => {
    if (!open) return;
    const update = () => setRect(elementRef.current?.getBoundingClientRect() ?? null);
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
        setRect(elementRef.current?.getBoundingClientRect() ?? null);
        setOpen(true);
      } else {
        setOpen(false);
      }
      setFocused(0);
    }, 220);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
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
    // Prevent newlines in textarea mode
    if (multiline && e.key === 'Enter') e.preventDefault();
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown')    { e.preventDefault(); setFocused(f => Math.min(f + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter' && suggestions[focused]) { e.preventDefault(); handleSelect(suggestions[focused]); }
    else if (e.key === 'Escape')  { setOpen(false); }
  }

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

  const sharedProps = {
    id,
    className,
    value,
    placeholder,
    autoComplete: 'off' as const,
    onChange: handleInput,
    onKeyDown: handleKeyDown,
    onFocus: () => { onFocus?.(); },
    onBlur: () => setOpen(false),
  };

  return (
    <>
      {multiline ? (
        <textarea
          ref={(el) => { elementRef.current = el; }}
          {...sharedProps}
          rows={1}
          style={{ resize: 'none', overflow: 'hidden' }}
        />
      ) : (
        <input
          ref={(el) => { elementRef.current = el; }}
          type="text"
          {...sharedProps}
        />
      )}
      {dropdown}
    </>
  );
}
