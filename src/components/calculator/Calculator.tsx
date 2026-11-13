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
import type { Profile, RouteState } from './routing';
import { getRoute, PROFILE_LABEL } from './routing';

const MapView = lazy(() => import('./MapView'));

export type Variant = 'crow' | 'travel';
interface Example {
  a: Place;
  b: Place;
}

const CROW_EXAMPLES: Example[] = [
  { a: { name: 'New York, NY', lat: 40.7143, lon: -74.006 }, b: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 } },
  { a: { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 }, b: { name: 'Tokyo, Japan', lat: 35.6895, lon: 139.6917 } },
  { a: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, b: { name: 'Edinburgh, United Kingdom', lat: 55.9521, lon: -3.1965 } },
  { a: { name: 'Chicago, IL', lat: 41.85, lon: -87.65 }, b: { name: 'Houston, TX', lat: 29.7633, lon: -95.3633 } },
  { a: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, b: { name: 'Sydney, Australia', lat: -33.8678, lon: 151.2073 } },
  { a: { name: 'Manchester, United Kingdom', lat: 53.4809, lon: -2.2374 }, b: { name: 'Liverpool, United Kingdom', lat: 53.4106, lon: -2.9779 } },
];

const TRAVEL_EXAMPLES: Example[] = [
  { a: { name: 'Empire State Building, 350 5th Ave, New York', lat: 40.7484, lon: -73.9857 }, b: { name: 'One World Trade Center, 285 Fulton St, New York', lat: 40.7127, lon: -74.0134 } },
  { a: { name: 'Buckingham Palace, London', lat: 51.5014, lon: -0.1419 }, b: { name: 'Tower of London, London', lat: 51.5081, lon: -0.0759 } },
  { a: { name: 'The White House, 1600 Pennsylvania Ave NW, Washington', lat: 38.8977, lon: -77.0365 }, b: { name: 'Lincoln Memorial, Washington', lat: 38.8893, lon: -77.0502 } },
  { a: { name: 'Willis Tower, 233 S Wacker Dr, Chicago', lat: 41.8789, lon: -87.6359 }, b: { name: 'Wrigley Field, 1060 W Addison St, Chicago', lat: 41.9484, lon: -87.6553 } },
  { a: { name: 'Space Needle, 400 Broad St, Seattle', lat: 47.6205, lon: -122.3493 }, b: { name: 'Pike Place Market, Seattle', lat: 47.6097, lon: -122.3422 } },
  { a: { name: 'Manchester Piccadilly Station, Manchester', lat: 53.4774, lon: -2.2309 }, b: { name: 'Old Trafford, Manchester', lat: 53.4631, lon: -2.2913 } },
];

/** Steady speeds used for the "how long would it take" rows. Round figures, not forecasts. */
const PACES: { who: string; mph: number }[] = [
  { who: 'A crow', mph: 30 },
  { who: 'Walking', mph: 3 },
  { who: 'Cycling', mph: 12 },
  { who: 'Driving', mph: 60 },
  { who: 'An airliner', mph: 550 },
];

/** Mileage rates for 2026: IRS business rate from 1 July 2026, HMRC AMAP 2026/27 first 10,000 miles. */
const IRS_RATE_USD = 0.76;
const HMRC_RATE_GBP = 0.55;

/** Walking and cycling routes are only requested when the straight line is shorter than this. */
const ACTIVE_LIMIT_M = 250_000;

const UNITS: Unit[] = ['mi', 'km', 'nmi'];
const PROFILES: Profile[] = ['car', 'foot', 'bike'];
const short = (name: string) => name.split(',')[0];
type Mode = 'line' | Profile;

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

interface Props {
  variant?: Variant;
}

export default function Calculator({ variant = 'crow' }: Props) {
  const travel = variant === 'travel';
  const examples = travel ? TRAVEL_EXAMPLES : CROW_EXAMPLES;
  const [a, setA] = useState<Place | null>(examples[0].a);
  const [b, setB] = useState<Place | null>(examples[0].b);
  const [unit, setUnit] = useState<Unit>('mi');
  const [view, setView] = useState<'globe' | 'map'>(travel ? 'map' : 'globe');
  const [mapWanted, setMapWanted] = useState(travel);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const [copied, setCopied] = useState<'' | 'link' | 'result'>('');
  const [routes, setRoutes] = useState<Partial<Record<Profile, RouteState | { status: 'skip' }>>>({});
  const [mode, setMode] = useState<Mode>(travel ? 'car' : 'line');
  const touched = useRef(false);

  // Open a shared link with its places already filled in.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = decodePlace(q.get('from'));
    const to = decodePlace(q.get('to'));
    const u = q.get('unit');
    const m = q.get('mode');
    if (from && to) {
      setA(from);
      setB(to);
    }
    if (travel && (m === 'line' || m === 'car' || m === 'bike' || m === 'foot')) setMode(m);
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

  const shareQuery = () => {
    const q = new URLSearchParams();
    if (a && b) {
      q.set('from', encodePlace(a));
      q.set('to', encodePlace(b));
      if (unit !== 'mi') q.set('unit', unit);
      if (travel && mode !== 'car') q.set('mode', mode);
    }
    return q.toString();
  };

  // Keep the address bar shareable once the person has changed something.
  useEffect(() => {
    if (!touched.current) return;
    const next = shareQuery();
    window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname);
  }, [a, b, unit, mode]);

  const result = useMemo(() => (a && b ? geodesic(a, b) : null), [a?.lat, a?.lon, b?.lat, b?.lon]);
  const line = useMemo(() => (a && b ? greatCirclePath(a, b) : []), [a?.lat, a?.lon, b?.lat, b?.lon]);
  const mid = a && b ? midpoint(a, b) : null;

  // Road, walking and cycling routes for the travel page.
  useEffect(() => {
    if (!travel) return;
    if (!a || !b || !result) {
      setRoutes({});
      return;
    }
    let live = true;
    const start: typeof routes = {};
    for (const p of PROFILES) {
      start[p] = p !== 'car' && result.distance > ACTIVE_LIMIT_M ? { status: 'skip' } : { status: 'loading' };
    }
    setRoutes(start);
    const timer = setTimeout(() => {
      for (const p of PROFILES) {
        if (start[p]?.status === 'skip') continue;
        getRoute(p, a, b)
          .then((route) => {
            if (!live) return;
            setRoutes((r) => ({ ...r, [p]: route ? { status: 'ok', route } : { status: 'none' } }));
          })
          .catch(() => live && setRoutes((r) => ({ ...r, [p]: { status: 'error' } })));
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [travel, a?.lat, a?.lon, b?.lat, b?.lon]);

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
      const update = (p: Place | null) => (p && p.lat === point.lat && p.lon === point.lon ? { ...p, name } : p);
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

  // What the headline shows: the chosen route when it is ready, else the straight line.
  const chosen = mode !== 'line' ? routes[mode] : undefined;
  const chosenRoute = chosen?.status === 'ok' ? chosen.route : null;
  const headMetres = chosenRoute ? chosenRoute.distance : (result?.distance ?? 0);
  const headHow =
    !travel || mode === 'line' || !chosenRoute
      ? 'in a straight line'
      : mode === 'car'
        ? 'by road'
        : mode === 'bike'
          ? 'by bike'
          : 'on foot';
  const car = routes.car?.status === 'ok' ? routes.car.route : null;

  async function copy(kind: 'link' | 'result') {
    if (!a || !b || !result) return;
    const link = `${window.location.origin}${window.location.pathname}?${shareQuery()}`;
    const crowText = `${formatNumber(toUnit(result.distance, 'mi'))} mi (${formatNumber(toUnit(result.distance, 'km'))} km) in a straight line`;
    const roadText = car
      ? `; ${formatNumber(toUnit(car.distance, 'mi'))} mi (${formatNumber(toUnit(car.distance, 'km'))} km) by road, about ${formatDuration(car.duration / 3600)}`
      : '';
    const text =
      kind === 'link'
        ? link
        : travel
          ? `${short(a.name)} to ${short(b.name)}: ${crowText}${roadText}. ${link}`
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
  const isShort = headMetres > 0 && headMetres < 1500;
  const fmt = (m: number) => `${formatNumber(toUnit(m, unit))} ${UNIT_LABEL[unit].short}`;

  return (
    <div className={`calc calc-${variant}`} id="calculator">
      <div className="calc-inputs">
        <form
          className="calc-form"
          onSubmit={(e) => e.preventDefault()}
          aria-label={travel ? 'Distance between two addresses calculator' : 'As the crow flies distance calculator'}
        >
          <PlaceInput
            letter="A"
            label="From"
            placeholder={travel ? 'Street address, place or coordinates' : 'City, address or coordinates'}
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
            placeholder={travel ? 'Street address, place or coordinates' : 'City, address or coordinates'}
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
                    {short(a.name)} to {short(b.name)}, {headHow}
                  </p>
                  <div className="calc-units" role="radiogroup" aria-label="Distance unit">
                    {UNITS.map((u) => (
                      <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => chooseUnit(u)} title={UNIT_LABEL[u].long}>
                        {UNIT_LABEL[u].short}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="calc-distance">
                  <output>{formatNumber(toUnit(headMetres, unit))}</output>
                  <span>{UNIT_LABEL[unit].long}</span>
                </p>
                <p className="calc-also">
                  {chosenRoute && <strong>About {formatDuration(chosenRoute.duration / 3600)} · </strong>}
                  {others.map((u) => `${formatNumber(toUnit(headMetres, u))} ${UNIT_LABEL[u].long}`).join(' · ')}
                  {isShort && ` · ${formatNumber(headMetres, 0)} m · ${formatNumber(headMetres / METRES_PER_FOOT, 0)} ft`}
                </p>
              </div>

              <div className="calc-details">
                {travel ? (
                  <>
                    <table className="calc-modes">
                      <caption>Every way to measure it. Pick a row to show it on the map.</caption>
                      <thead>
                        <tr>
                          <th scope="col">How</th>
                          <th scope="col" className="num">Distance</th>
                          <th scope="col" className="num">Time</th>
                          <th scope="col" className="num">vs line</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ModeRow
                          label="Straight line"
                          icon="line"
                          selected={mode === 'line'}
                          onSelect={() => setMode('line')}
                          distance={fmt(result.distance)}
                          time="—"
                          ratio="1.00×"
                        />
                        {PROFILES.map((p) => {
                          const st = routes[p];
                          const ok = st?.status === 'ok' ? st.route : null;
                          const note =
                            st?.status === 'loading' || !st
                              ? 'Finding route…'
                              : st.status === 'skip'
                                ? 'Too far'
                                : st.status === 'none'
                                  ? 'No route'
                                  : st.status === 'error'
                                    ? 'Unavailable'
                                    : '';
                          return (
                            <ModeRow
                              key={p}
                              label={PROFILE_LABEL[p]}
                              icon={p}
                              selected={mode === p}
                              disabled={!ok}
                              onSelect={() => setMode(p)}
                              distance={ok ? fmt(ok.distance) : note}
                              time={ok ? formatDuration(ok.duration / 3600) : ''}
                              ratio={ok && result.distance > 0 ? `${(ok.distance / result.distance).toFixed(2)}×` : ''}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                    {car && (
                      <p className="calc-mileage">
                        <span>Mileage value of the drive</span>
                        <strong>
                          ${formatNumber((car.distance / METRES_PER_MILE) * IRS_RATE_USD, 2)} at the IRS 76¢ a mile
                        </strong>
                        <strong>
                          £{formatNumber((car.distance / METRES_PER_MILE) * HMRC_RATE_GBP, 2)} at HMRC’s 55p a mile
                        </strong>
                      </p>
                    )}
                    <p className="calc-note">
                      Times assume free-flowing traffic and no stops. Routes use OpenStreetMap data.
                    </p>
                  </>
                ) : (
                  <>
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
                  </>
                )}

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
              Enter a start and an end to measure the distance between them. A street address, a place name or coordinates
              such as 40.7128, -74.0060 all work.
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
                  distanceLabel={chosenRoute ? `${fmt(chosenRoute.distance)} ${headHow}` : distanceLabel}
                  unit={unit}
                  line={line}
                  roadLine={chosenRoute ? chosenRoute.line : null}
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
            : travel
              ? 'Dashed magenta line: straight line. Solid dark line: the route picked in the table. Drag a pin to move it.'
              : 'Drag a pin to move it. The line bends on a flat map because the map is stretched, not the route.'}
        </p>
      </div>

      <div className="calc-examples">
        <span id={`examples-label-${variant}`}>Try a route</span>
        <ul aria-labelledby={`examples-label-${variant}`}>
          {examples.map((ex) => (
            <li key={`${ex.a.name}-${ex.b.name}`}>
              <button
                type="button"
                onClick={() => {
                  touched.current = true;
                  setA(ex.a);
                  setB(ex.b);
                  if (travel || geodesic(ex.a, ex.b).distance < 400_000) showMap();
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

function ModeRow({
  label,
  icon,
  selected,
  disabled = false,
  onSelect,
  distance,
  time,
  ratio,
}: {
  label: string;
  icon: Mode;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  distance: string;
  time: string;
  ratio: string;
}) {
  return (
    <tr className={selected ? 'is-selected' : undefined}>
      <th scope="row">
        <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}>
          <ModeIcon mode={icon} />
          {label}
        </button>
      </th>
      <td className="num">{distance}</td>
      <td className="num">{time}</td>
      <td className="num">{ratio}</td>
    </tr>
  );
}

function ModeIcon({ mode }: { mode: Mode }) {
  const paths: Record<Mode, string> = {
    line: 'M4 18L20 6M4 18a1.5 1.5 0 100 .01M20 6a1.5 1.5 0 100 .01',
    car: 'M5 16h14v-4l-2-5H7l-2 5zM5 16v2.5M19 16v2.5M7.5 13.5h.01M16.5 13.5h.01',
    bike: 'M6 17.5a3.5 3.5 0 100-.01M18 17.5a3.5 3.5 0 100-.01M6 17.5l4-7h5l3 7M10 10.5L8.5 7H7M15 10.5l-1.5-3.5h2.5',
    foot: 'M13 4.5a1.5 1.5 0 100-.01M10 21l2-6 2.5 2.5V21M8 12l2.5-4.5 3 1 2 3.5M12 15l-1-3.5',
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[mode]} />
    </svg>
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
