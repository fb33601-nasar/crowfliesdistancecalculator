import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon, Place, Unit } from '../../lib/geo';
import {
  compass,
  formatCoord,
  formatDuration,
  formatNumber,
  geodesic,
  greatCirclePath,
  METRES_PER_FOOT,
  METRES_PER_MILE,
  midpoint,
  toUnit,
  UNIT_LABEL,
} from '../../lib/geo';
import Globe from './Globe';
import PlaceInput from './PlaceInput';
import { nameForPoint } from './places';

const MapView = lazy(() => import('./MapView'));

const START: Place = { name: 'New York, NY', lat: 40.7143, lon: -74.006 };
const END: Place = { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 };

const EXAMPLES: { a: Place; b: Place }[] = [
  { a: START, b: END },
  { a: { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 }, b: { name: 'Tokyo, Japan', lat: 35.6895, lon: 139.6917 } },
  { a: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, b: { name: 'Edinburgh, United Kingdom', lat: 55.9521, lon: -3.1965 } },
  { a: { name: 'Chicago, IL', lat: 41.85, lon: -87.65 }, b: { name: 'Houston, TX', lat: 29.7633, lon: -95.3633 } },
  { a: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, b: { name: 'Sydney, Australia', lat: -33.8678, lon: 151.2073 } },
  { a: { name: 'Manchester, United Kingdom', lat: 53.4809, lon: -2.2374 }, b: { name: 'Liverpool, United Kingdom', lat: 53.4106, lon: -2.9779 } },
];

/** Steady speeds used for the "how long would it take" rows. Round figures, not forecasts. */
const PACES: { who: string; mph: number }[] = [
  { who: 'A crow', mph: 30 },
  { who: 'Walking', mph: 3 },
  { who: 'Cycling', mph: 12 },
  { who: 'Driving', mph: 60 },
  { who: 'An airliner', mph: 550 },
];

const UNITS: Unit[] = ['mi', 'km', 'nmi'];
const short = (name: string) => name.split(',')[0];

function encodePlace(p: Place): string {
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.name}`;
}
function decodePlace(raw: string | null): Place | null {
  if (!raw) return null;
  const [lat, lon, ...rest] = raw.split(',');
  const p = { lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
  return { ...p, name: rest.join(',').trim().slice(0, 120) || formatCoord(p) };
}

export default function Calculator() {
  const [a, setA] = useState<Place | null>(START);
  const [b, setB] = useState<Place | null>(END);
  const [unit, setUnit] = useState<Unit>('mi');
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [mapWanted, setMapWanted] = useState(false);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const [copied, setCopied] = useState<'' | 'link' | 'result'>('');
  const touched = useRef(false);

  // Open a shared link with its places already filled in.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = decodePlace(q.get('from'));
    const to = decodePlace(q.get('to'));
    const u = q.get('unit');
    if (from && to) {
      setA(from);
      setB(to);
    }
    if (u === 'mi' || u === 'km' || u === 'nmi') setUnit(u);
    else {
      try {
        const saved = window.localStorage.getItem('unit');
        if (saved === 'mi' || saved === 'km' || saved === 'nmi') setUnit(saved);
      } catch {
        /* storage can be blocked; miles stay the default */
      }
    }
  }, []);

  // Keep the address bar shareable once the person has changed something.
  useEffect(() => {
    if (!touched.current) return;
    const q = new URLSearchParams();
    if (a && b) {
      q.set('from', encodePlace(a));
      q.set('to', encodePlace(b));
      if (unit !== 'mi') q.set('unit', unit);
    }
    const next = q.toString();
    window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname);
  }, [a, b, unit]);

  const result = useMemo(() => (a && b ? geodesic(a, b) : null), [a?.lat, a?.lon, b?.lat, b?.lon]);
  const line = useMemo(
    () => (a && b ? greatCirclePath(a, b) : []),
    [a?.lat, a?.lon, b?.lat, b?.lon],
  );
  const mid = a && b ? midpoint(a, b) : null;

  function showMap() {
    setMapWanted(true);
    setView('map');
  }

  function setPlace(which: 'a' | 'b', place: Place | null) {
    touched.current = true;
    const other = which === 'a' ? b : a;
    (which === 'a' ? setA : setB)(place);
    // A hop of a few hundred miles is too small to read on the globe.
    if (place && other && geodesic(place, other).distance < 400_000) showMap();
  }

  function pickFromMap(which: 'a' | 'b', point: LatLon, knownName?: string) {
    setPicking(null);
    if (knownName) {
      setPlace(which, { ...point, name: knownName });
      return;
    }
    setPlace(which, { ...point, name: formatCoord(point) });
    void nameForPoint(point.lat, point.lon).then((name) => {
      if (!name) return;
      const update = (p: Place | null) =>
        p && p.lat === point.lat && p.lon === point.lon ? { ...p, name } : p;
      (which === 'a' ? setA : setB)(update);
    });
  }

  function chooseUnit(u: Unit) {
    touched.current = true;
    setUnit(u);
    try {
      window.localStorage.setItem('unit', u);
    } catch {
      /* ignore */
    }
  }

  function swap() {
    touched.current = true;
    setA(b);
    setB(a);
  }

  async function copy(kind: 'link' | 'result') {
    if (!a || !b || !result) return;
    const q = new URLSearchParams({ from: encodePlace(a), to: encodePlace(b) });
    if (unit !== 'mi') q.set('unit', unit);
    const link = `${window.location.origin}${window.location.pathname}?${q.toString()}`;
    const text =
      kind === 'link'
        ? link
        : `${short(a.name)} to ${short(b.name)} as the crow flies: ${formatNumber(toUnit(result.distance, 'mi'))} mi (${formatNumber(toUnit(result.distance, 'km'))} km, ${formatNumber(toUnit(result.distance, 'nmi'))} nmi), heading ${Math.round(result.initialBearing)}° ${compass(result.initialBearing).abbr}. ${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  const others = UNITS.filter((u) => u !== unit);
  const distanceLabel = result ? `${formatNumber(toUnit(result.distance, unit))} ${UNIT_LABEL[unit].short}` : '';

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicking(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);
  const isShort = result !== null && result.distance < 1500;

  return (
    <div className="calc" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="As the crow flies distance calculator">
          <PlaceInput
            letter="A"
            label="From"
            placeholder="City, address or coordinates"
            value={a}
            onChange={(p) => setPlace('a', p)}
            onPickOnMap={() => setPicking('a')}
          />
          <button type="button" className="calc-swap" onClick={swap} aria-label="Swap start and end">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M6 3v13m0 0l-3-3m3 3l3-3M14 17V4m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <PlaceInput
            letter="B"
            label="To"
            placeholder="City, address or coordinates"
            value={b}
            onChange={(p) => setPlace('b', p)}
            onPickOnMap={() => setPicking('b')}
          />
        </form>

        <div className="calc-result" aria-live="polite">
          {result && a && b ? (
            <>
              <div className="calc-summary">
              <div className="calc-head">
                <p className="calc-route">
                  {short(a.name)} to {short(b.name)}, in a straight line
                </p>
                <div className="calc-units" role="radiogroup" aria-label="Distance unit">
                  {UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      role="radio"
                      aria-checked={unit === u}
                      onClick={() => chooseUnit(u)}
                      title={UNIT_LABEL[u].long}
                    >
                      {UNIT_LABEL[u].short}
                    </button>
                  ))}
                </div>
              </div>
              <p className="calc-distance">
                <output>{formatNumber(toUnit(result.distance, unit))}</output>
                <span>{UNIT_LABEL[unit].long}</span>
              </p>
              <p className="calc-also">
                {others.map((u) => `${formatNumber(toUnit(result.distance, u))} ${UNIT_LABEL[u].long}`).join(' · ')}
                {isShort &&
                  ` · ${formatNumber(result.distance, 0)} m · ${formatNumber(result.distance / METRES_PER_FOOT, 0)} ft`}
              </p>
              </div>

              <div className="calc-details">
              <dl className="calc-facts">
                <div>
                  <dt>Heading at the start</dt>
                  <dd>
                    <Needle bearing={result.initialBearing} />
                    {Math.round(result.initialBearing)}° {compass(result.initialBearing).name}
                  </dd>
                </div>
                <div>
                  <dt>Heading on arrival</dt>
                  <dd>
                    <Needle bearing={result.finalBearing} />
                    {Math.round(result.finalBearing)}° {compass(result.finalBearing).name}
                  </dd>
                </div>
                <div>
                  <dt>Halfway point</dt>
                  <dd>{mid ? formatCoord(mid, 3) : ''}</dd>
                </div>
              </dl>

              <table className="calc-times">
                <caption>Time to cover it without a single detour</caption>
                <tbody>
                  {PACES.map((p) => (
                    <tr key={p.who}>
                      <th scope="row">
                        {p.who} <small>{p.mph} mph</small>
                      </th>
                      <td>{formatDuration(result.distance / METRES_PER_MILE / p.mph)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="calc-actions">
                <button type="button" onClick={() => copy('link')}>
                  {copied === 'link' ? 'Link copied' : 'Copy link'}
                </button>
                <button type="button" onClick={() => copy('result')}>
                  {copied === 'result' ? 'Result copied' : 'Copy result'}
                </button>
              </div>
              </div>
            </>
          ) : (
            <p className="calc-empty">
              Enter a start and an end to measure the distance between them. A city name, a street
              address or coordinates such as 40.7128, -74.0060 all work.
            </p>
          )}
        </div>
      </div>

      <div className="calc-visual">
        <div className="calc-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'globe'} onClick={() => setView('globe')}>
            Globe
          </button>
          <button type="button" role="tab" aria-selected={view === 'map'} onClick={showMap}>
            Street map
          </button>
        </div>
        <div className="calc-stage">
          <div hidden={view !== 'globe'} className="calc-globe">
            <Globe
              a={a}
              b={b}
              labelA={a ? short(a.name) : ''}
              labelB={b ? short(b.name) : ''}
              distanceLabel={distanceLabel}
              picking={picking}
              onPick={pickFromMap}
            />
          </div>
          {mapWanted && (
            <div hidden={view !== 'map'} className="calc-map">
              <Suspense fallback={<p className="map-status">Loading the map…</p>}>
                <MapView
                  a={a}
                  b={b}
                  labelA={a ? short(a.name) : ''}
                  labelB={b ? short(b.name) : ''}
                  distanceLabel={distanceLabel}
                  unit={unit}
                  line={line}
                  picking={picking}
                  visible={view === 'map'}
                  onPick={pickFromMap}
                />
              </Suspense>
            </div>
          )}
          {picking && (
            <div className="calc-picking" role="status">
              <span>
                Click the {view === 'globe' ? 'globe' : 'map'} to place point {picking.toUpperCase()}
              </span>
              <button type="button" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <p className="calc-hint">
          {view === 'globe'
            ? 'Drag to turn, scroll or pinch to zoom, hover to see where you are, click a place for details.'
            : 'Drag a pin to move it. The line bends on a flat map because the map is stretched, not the route.'}
        </p>
      </div>

      <div className="calc-examples">
        <span id="examples-label">Try a route</span>
        <ul aria-labelledby="examples-label">
          {EXAMPLES.map((ex) => (
            <li key={`${ex.a.name}-${ex.b.name}`}>
              <button
                type="button"
                onClick={() => {
                  touched.current = true;
                  setA(ex.a);
                  setB(ex.b);
                  if (geodesic(ex.a, ex.b).distance < 400_000) showMap();
                  else setView('globe');
                }}
              >
                {short(ex.a.name)} to {short(ex.b.name)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Needle({ bearing }: { bearing: number }) {
  return (
    <svg className="needle" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M12 3.2l4 10.3-4-2.2-4 2.2z" fill="currentColor" transform={`rotate(${bearing.toFixed(1)} 12 12)`} />
    </svg>
  );
}
