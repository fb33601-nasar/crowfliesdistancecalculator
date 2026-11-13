import { useEffect, useId, useRef, useState } from 'react';
import type { Airport } from './airports';
import { countryOf, loadAirports, searchAirports } from './airports';

interface Props {
  label: string;
  letter: string;
  value: Airport | null;
  onChange: (a: Airport | null) => void;
  onRemove?: () => void;
}

export default function AirportInput({ label, letter, value, onChange, onRemove }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value ? `${value.iata} – ${value.city || value.name}` : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<Airport[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setText(value ? `${value.iata} – ${value.city || value.name}` : '');
  }, [value?.iata]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadAirports().then(() => live && setHits(searchAirports(text)));
    return () => {
      live = false;
    };
  }, [text, open]);

  function choose(a: Airport) {
    onChange(a);
    setText(`${a.iata} – ${a.city || a.name}`);
    setOpen(false);
  }

  return (
    <div className="place airport">
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
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="City, airport name or code (JFK)"
          value={text}
          onFocus={(e) => {
            void loadAirports();
            e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!hits.length) return;
              setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % hits.length : (i - 1 + hits.length) % hits.length));
            } else if (e.key === 'Enter') {
              if (open && hits[active]) {
                e.preventDefault();
                choose(hits[active]);
              }
            } else if (e.key === 'Escape') setOpen(false);
          }}
          onBlur={() => {
            setOpen(false);
            setText(value ? `${value.iata} – ${value.city || value.name}` : '');
          }}
        />
        {onRemove ? (
          <button type="button" className="place-clear" aria-label={`Remove ${label.toLowerCase()}`} onMouseDown={(e) => e.preventDefault()} onClick={onRemove}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        ) : (
          text !== '' && (
            <button
              type="button"
              className="place-clear"
              aria-label={`Clear ${label.toLowerCase()}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText('');
                setOpen(true);
                inputRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          )
        )}
        <ul id={listId} role="listbox" className="place-list" hidden={!open || hits.length === 0} aria-label={`${label} suggestions`}>
          {hits.map((a, i) => (
            <li
              key={a.iata}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="place-option airport-option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(a)}
            >
              <span><b className="airport-code">{a.iata}</b> {a.name}</span>
              <small>{[a.city, countryOf(a.country)].filter(Boolean).join(', ')}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
