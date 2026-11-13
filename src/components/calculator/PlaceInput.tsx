import { useEffect, useId, useRef, useState } from 'react';
import type { Place } from '../../lib/geo';
import { formatCoord } from '../../lib/geo';
import type { Suggestion } from './places';
import { coordsSuggestion, loadCities, searchCities, searchPlaces } from './places';

interface Props {
  letter: 'A' | 'B';
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  onPickOnMap: () => void;
}

type Row =
  | { kind: 'place'; s: Suggestion }
  | { kind: 'locate' }
  | { kind: 'map' };

export default function PlaceInput({ letter, label, placeholder, value, onChange, onPickOnMap }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Suggestion[]>([]);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = useRef(false);

  // Keep the box in step when the place is set from outside (map, swap, examples).
  useEffect(() => {
    setText(value?.name ?? '');
    typed.current = false;
    setNote('');
    setLocal([]);
    setRemote([]);
  }, [value?.name, value?.lat, value?.lon]);

  // Look up suggestions as the person types.
  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    setNote('');
    const coords = coordsSuggestion(q);
    if (coords) {
      setLocal([coords]);
      setRemote([]);
      return;
    }
    setLocal(searchCities(q));
    if (q.length < 3) {
      setRemote([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      searchPlaces(q, controller.signal)
        .then((found) => setRemote(found))
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') {
            setRemote([]);
            setNote('Address search is not responding. City names and coordinates still work.');
          }
        })
        .finally(() => setBusy(false));
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const places: Suggestion[] = [];
  for (const s of [...local, ...remote]) {
    const near = places.some(
      (p) => Math.abs(p.lat - s.lat) < 0.05 && Math.abs(p.lon - s.lon) < 0.05 && p.name.split(',')[0] === s.name.split(',')[0],
    );
    if (!near && places.length < 7) places.push(s);
  }
  const rows: Row[] = [
    ...places.map((s): Row => ({ kind: 'place', s })),
    { kind: 'locate' },
    { kind: 'map' },
  ];

  function choose(row: Row) {
    setOpen(false);
    setActive(-1);
    if (row.kind === 'place') {
      onChange({ name: row.s.name, lat: row.s.lat, lon: row.s.lon });
      return;
    }
    if (row.kind === 'map') {
      onPickOnMap();
      return;
    }
    if (!('geolocation' in navigator)) {
      setNote('This browser cannot share a location. Type a place or pick it on the map.');
      return;
    }
    setNote('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNote('');
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        onChange({ ...p, name: `My location (${formatCoord(p, 3)})` });
      },
      () => setNote('Location was not shared. Type a place or pick it on the map.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        const n = rows.length;
        return e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
      });
    } else if (e.key === 'Enter') {
      if (open && rows[active]) {
        e.preventDefault();
        choose(rows[active]);
      } else if (open && places[0]) {
        e.preventDefault();
        choose({ kind: 'place', s: places[0] });
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      setText(value?.name ?? '');
    }
  }

  return (
    <div className="place">
      <label htmlFor={id}>
        <span className="place-letter" aria-hidden="true">{letter}</span>
        {label}
      </label>
      <div className="place-field">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={text}
          onFocus={(e) => {
            void loadCities();
            e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => {
            typed.current = true;
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
            if (text.trim() === '') onChange(null);
            else setText(value?.name ?? text);
          }}
        />
        {text !== '' && (
          <button
            type="button"
            className="place-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              setText('');
              typed.current = true;
              setLocal([]);
              setRemote([]);
              inputRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <ul id={listId} role="listbox" className="place-list" hidden={!open} aria-label={`${label} suggestions`}>
          {rows.map((row, i) => (
            <li
              key={row.kind === 'place' ? `${row.s.name}-${row.s.lat}-${row.s.lon}` : row.kind}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={row.kind === 'place' ? 'place-option' : 'place-option place-action'}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(row)}
            >
              {row.kind === 'place' && (
                <>
                  <span>{row.s.title ?? row.s.name}</span>
                  {row.s.detail && <small>{row.s.detail}</small>}
                </>
              )}
              {row.kind === 'locate' && (
                <>
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <circle cx="10" cy="10" r="3" fill="currentColor" />
                    <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10 1v3.5M10 15.5V19M1 10h3.5M15.5 10H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span>Use my location</span>
                </>
              )}
              {row.kind === 'map' && (
                <>
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path d="M10 18s5.5-5.2 5.5-9.5a5.5 5.5 0 10-11 0C4.5 12.8 10 18 10 18z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <circle cx="10" cy="8.5" r="2" fill="currentColor" />
                  </svg>
                  <span>Pick point {letter} on the map</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="place-note" role="status">
        {note || (busy && open ? 'Searching…' : '')}
      </p>
    </div>
  );
}
