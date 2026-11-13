import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import {
  capArea,
  compass,
  formatCoord,
  formatDuration,
  formatNumber,
  haversine,
  METRES_PER_SQ_MILE,
  sphericalBearing,
} from '../../lib/geo';
import Globe from './Globe';
import PlaceInput from './PlaceInput';
import type { Town } from './places';
import { loadTowns } from './places';
import type { RadiusMapHandle } from './RadiusMapView';

const RadiusMapView = lazy(() => import('./RadiusMapView'));

type Unit = 'mi' | 'km';
type Mode = 'distance' | 'time';
type Travel = 'walk' | 'bike' | 'drive';

const MI = 1609.344;
const UNIT_M: Record<Unit, number> = { mi: MI, km: 1000 };
/** Typical door-to-door speeds, in mph. */
const SPEED: Record<Travel, number> = { walk: 3, bike: 10, drive: 40 };
const TRAVEL_LABEL: Record<Travel, string> = { walk: 'walking', bike: 'cycling', drive: 'driving' };
/** Median road route over straight line in our 18-pair sample. */
const DETOUR = 1.19;
const DIST_PRESETS = [1, 5, 10, 20, 25, 50, 100, 250];
const TIME_PRESETS = [15, 30, 60, 120, 180, 300];
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DIR_NAME: Record<string, string> = {
  N: 'North', NE: 'Northeast', E: 'East', SE: 'Southeast', S: 'South', SW: 'Southwest', W: 'West', NW: 'Northwest',
};

const EXAMPLE: Place = { name: 'Kansas City, MO (example)', lat: 39.0997, lon: -94.5786 };

type LocState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'ok'; accuracy: number }
  | { kind: 'error'; message: string };

function minutesLabel(min: number) {
  return min < 60 ? `${min} min` : `${min / 60} ${min === 60 ? 'hour' : 'hours'}`;
}

/** Name a point from the town list, without sending it anywhere. */
function nearestTown(p: LatLon, towns: Town[]): { town: Town; d: number } | null {
  let best: { town: Town; d: number } | null = null;
  for (const t of towns) {
    if (Math.abs(t.lat - p.lat) > 1) continue;
    const d = haversine(p, t);
    if (!best || d < best.d) best = { town: t, d };
  }
  return best;
}

export default function NearMeTool() {
  const [center, setCenter] = useState<Place>(EXAMPLE);
  const [isExample, setIsExample] = useState(true);
  const [loc, setLoc] = useState<LocState>({ kind: 'idle' });
  const [mode, setMode] = useState<Mode>('distance');
  const [unit, setUnit] = useState<Unit>('mi');
  const [distText, setDistText] = useState('25');
  const [minutes, setMinutes] = useState(60);
  const [travel, setTravel] = useState<Travel>('drive');
  const [towns, setTowns] = useState<Town[]>([]);
  const [view, setView] = useState<'map' | 'globe'>('map');
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const mapRef = useRef<RadiusMapHandle>(null);
  const touched = useRef(false);

  const distValue = Math.max(0, Number(distText.replace(/,/g, '')) || 0);
  const radius = useMemo(() => {
    if (mode === 'time') return ((minutes / 60) * SPEED[travel] * MI) / DETOUR;
    return Math.min(distValue * UNIT_M[unit], 5_000_000);
  }, [mode, minutes, travel, distValue, unit]);

  useEffect(() => {
    loadTowns().then(setTowns);
    const q = new URLSearchParams(window.location.search);
    const at = q.get('at')?.split(',').map(Number);
    if (at && at.length === 2 && at.every(Number.isFinite) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180) {
      setCenter({ lat: at[0], lon: at[1], name: q.get('name')?.slice(0, 120) || formatCoord({ lat: at[0], lon: at[1] }) });
      setIsExample(false);
    }
    const u = q.get('unit');
    if (u === 'km' || u === 'mi') setUnit(u);
    const r = Number(q.get('r'));
    if (r > 0) setDistText(String(r));
    const t = Number(q.get('t'));
    const by = q.get('by') as Travel | null;
    if (t > 0 && by && by in SPEED) {
      setMode('time');
      setMinutes(Math.min(t, 1440));
      setTravel(by);
    }
  }, []);

  // Give a located point a town name once the list arrives.
  useEffect(() => {
    if (!towns.length || isExample || !center.name.startsWith('My location')) return;
    const n = nearestTown(center, towns);
    if (n && n.d < 40_000) setCenter((c) => ({ ...c, name: `My location, near ${n.town.label}` }));
  }, [towns, center.lat, center.lon]);

  useEffect(() => {
    if (!touched.current || isExample) return;
    window.history.replaceState(null, '', `?${query(false)}`);
  }, [center, unit, distText, mode, minutes, travel]);

  function query(withLocation: boolean) {
    const q = new URLSearchParams();
    if (withLocation) {
      q.set('at', `${center.lat.toFixed(4)},${center.lon.toFixed(4)}`);
      q.set('name', center.name);
    }
    if (mode === 'time') {
      q.set('t', String(minutes));
      q.set('by', travel);
    } else q.set('r', String(distValue));
    if (unit !== 'mi') q.set('unit', unit);
    return q.toString();
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      setLoc({ kind: 'error', message: 'This browser cannot share its location. Type a place instead.' });
      return;
    }
    setLoc({ kind: 'asking' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        touched.current = true;
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const n = towns.length ? nearestTown(p, towns) : null;
        setCenter({ ...p, name: n && n.d < 40_000 ? `My location, near ${n.town.label}` : `My location (${formatCoord(p, 3)})` });
        setIsExample(false);
        setLoc({ kind: 'ok', accuracy: pos.coords.accuracy });
      },
      (err) =>
        setLoc({
          kind: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location access was blocked. Allow it in your browser’s site settings, or type a place below.'
              : 'Your location could not be found just now. Try again, or type a place below.',
        }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  function choosePlace(p: Place | null) {
    if (!p) return;
    touched.current = true;
    setCenter(p);
    setIsExample(false);
    setLoc({ kind: 'idle' });
  }

  function pick(p: LatLon, known?: string) {
    setPicking(false);
    touched.current = true;
    const n = !known && towns.length ? nearestTown(p, towns) : null;
    setCenter({ ...p, name: known ?? (n && n.d < 15_000 ? `Near ${n.town.label}` : formatCoord(p)) });
    setIsExample(false);
  }

  function setRadiusFromMap(m: number) {
    touched.current = true;
    setMode('distance');
    const v = m / UNIT_M[unit];
    setDistText(String(Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2))));
  }

  const unitShort = unit === 'mi' ? 'mi' : 'km';
  const fmt = (m: number) => {
    const v = m / UNIT_M[unit];
    const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${formatNumber(Number(v.toFixed(d)), Number.isInteger(Number(v.toFixed(d))) ? 0 : d)} ${unitShort}`;
  };
  const radiusLabel = mode === 'time' ? `${minutesLabel(minutes)} ${TRAVEL_LABEL[travel]}` : fmt(radius);

  const found = useMemo(() => {
    if (!towns.length || radius <= 0) return null;
    const inside: { t: Town; d: number; b: number }[] = [];
    for (const t of towns) {
      if (Math.abs(t.lat - center.lat) * 111_000 > radius * 1.1) continue;
      const d = haversine(center, t);
      if (d <= radius * 1.08) inside.push({ t, d, b: sphericalBearing(center, t) });
    }
    const within = inside.filter((x) => x.d <= radius).sort((a, b) => a.d - b.d);
    // Biggest town near the edge in each of eight directions.
    const edge = DIRS.map((dir, i) => {
      const band = inside.filter((x) => {
        const sector = Math.round(x.b / 45) % 8;
        return sector === i && x.d >= radius * 0.75;
      });
      band.sort((a, b) => b.t.population - a.t.population);
      return { dir, hit: band[0] ?? null };
    });
    const biggest = [...within].sort((a, b) => b.t.population - a.t.population).slice(0, 6);
    return { total: within.length, nearest: within.slice(0, 12), edge, biggest };
  }, [towns, center.lat, center.lon, radius]);

  const area = capArea(radius);
  const times = (Object.keys(SPEED) as Travel[]).map((tv) => ({
    tv,
    hours: ((radius * DETOUR) / MI) / SPEED[tv],
  }));

  async function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?${query(true)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  function download() {
    const run = () => {
      const url = mapRef.current?.snapshot();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${radiusLabel.replace(/[^\w]+/g, '-').toLowerCase()}-radius-map.png`;
      a.click();
    };
    if (view !== 'map') {
      setView('map');
      setTimeout(run, 1500);
    } else run();
  }

  const mapCircles = [
    { id: 'me', center, radius: Math.max(radius, 10), color: '#c4157a', selected: true, label: `${radiusLabel} radius` },
  ];

  return (
    <div className="calc calc-radius calc-nearme" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Mile radius from your location">
          <div className="nearme-locate">
            <button type="button" className="nearme-locate-btn" onClick={locate} disabled={loc.kind === 'asking'}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.4" fill="currentColor" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {loc.kind === 'asking' ? 'Finding you…' : loc.kind === 'ok' ? 'Update my location' : 'Use my current location'}
            </button>
            <p className={`nearme-status${loc.kind === 'error' ? ' is-error' : ''}`} role="status">
              {loc.kind === 'ok' &&
                `Located to within about ${loc.accuracy < 1000 ? `${Math.round(loc.accuracy)} m` : `${formatNumber(loc.accuracy / 1000, 1)} km`}. Your location stays in this browser.`}
              {loc.kind === 'error' && loc.message}
              {loc.kind === 'idle' && isExample && 'Showing an example around Kansas City until you share your location or type a place.'}
            </p>
          </div>

          <PlaceInput
            letter="●"
            label="Or start from a place"
            pickLabel="Pick the starting point on the map"
            placeholder="Address, city, ZIP code or coordinates"
            value={isExample ? null : center}
            onChange={choosePlace}
            onPickOnMap={() => setPicking(true)}
          />

          <div className="radius-row">
            <div className="nearme-modes" role="radiogroup" aria-label="Measure the radius by">
              <button type="button" role="radio" aria-checked={mode === 'distance'} onClick={() => { touched.current = true; setMode('distance'); }}>
                Distance
              </button>
              <button type="button" role="radio" aria-checked={mode === 'time'} onClick={() => { touched.current = true; setMode('time'); }}>
                Travel time
              </button>
            </div>

            {mode === 'distance' ? (
              <>
                <label htmlFor="nm-dist">How far from you?</label>
                <div className="radius-inputs">
                  <input
                    id="nm-dist"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={distText}
                    onChange={(e) => { touched.current = true; setDistText(e.target.value); }}
                  />
                  <select value={unit} onChange={(e) => { touched.current = true; const u = e.target.value as Unit; setDistText(String(Number((radius / UNIT_M[u]).toFixed(1)))); setUnit(u); }} aria-label="Unit">
                    <option value="mi">miles</option>
                    <option value="km">kilometers</option>
                  </select>
                </div>
                <div className="radius-presets" role="group" aria-label="Common distances">
                  {DIST_PRESETS.map((v) => (
                    <button key={v} type="button" aria-pressed={distValue === v} onClick={() => { touched.current = true; setDistText(String(v)); }}>
                      {v} {unitShort}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label htmlFor="nm-time">How long a trip?</label>
                <div className="radius-inputs">
                  <select id="nm-time" value={minutes} onChange={(e) => { touched.current = true; setMinutes(Number(e.target.value)); }}>
                    {[...new Set([...TIME_PRESETS, 10, 20, 45, 90, 240, 360, 480, minutes])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>{minutesLabel(m)}</option>
                    ))}
                  </select>
                  <select value={travel} onChange={(e) => { touched.current = true; setTravel(e.target.value as Travel); }} aria-label="Travel by">
                    <option value="drive">by car</option>
                    <option value="bike">by bike</option>
                    <option value="walk">on foot</option>
                  </select>
                </div>
                <div className="radius-presets" role="group" aria-label="Common trip times">
                  {TIME_PRESETS.map((m) => (
                    <button key={m} type="button" aria-pressed={minutes === m} onClick={() => { touched.current = true; setMinutes(m); }}>
                      {minutesLabel(m)}
                    </button>
                  ))}
                </div>
                <p className="calc-note">
                  An estimate: {SPEED[travel]} mph average, with roads {Math.round((DETOUR - 1) * 100)}% longer than the straight line. That gives a
                  circle of about {fmt(radius)}.
                </p>
              </>
            )}
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          <div className="calc-summary">
            <p className="calc-route">
              Within {radiusLabel} of {center.name.replace(/ \(example\)$/, '')}
            </p>
            <dl className="radius-stats">
              <div>
                <dt>Radius</dt>
                <dd>
                  {fmt(radius)}
                  <small>{unit === 'mi' ? `${formatNumber(radius / 1000, 1)} km` : `${formatNumber(radius / MI, 1)} mi`} as the crow flies</small>
                </dd>
              </div>
              <div>
                <dt>Area covered</dt>
                <dd>
                  {formatNumber(area / METRES_PER_SQ_MILE, area / METRES_PER_SQ_MILE < 10 ? 2 : 0)} sq mi
                  <small>{formatNumber(area / 1e6, area / 1e6 < 10 ? 2 : 0)} km²</small>
                </dd>
              </div>
              <div>
                <dt>Towns inside</dt>
                <dd>
                  {found ? formatNumber(found.total, 0) : '…'}
                  <small>of 5,000+ people</small>
                </dd>
              </div>
            </dl>
          </div>

          <div className="calc-details">
            {found && (
              <div className="nearme-edge">
                <p className="radius-places-head">Places about {fmt(radius)} away</p>
                <ul>
                  {found.edge.map(({ dir, hit }) => (
                    <li key={dir}>
                      <span className="nearme-dir" aria-label={DIR_NAME[dir]}>{dir}</span>
                      {hit ? (
                        <span>
                          {hit.t.label} <small>{fmt(hit.d)}</small>
                        </span>
                      ) : (
                        <span className="nearme-none">No town near the edge</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {found && found.nearest.length > 0 && (
              <div className="radius-places">
                <p className="radius-places-head">Nearest towns inside the circle</p>
                <ol>
                  {found.nearest.map(({ t, d, b }) => (
                    <li key={`${t.label}-${t.lat}`}>
                      <span>{t.label}</span>
                      <span>{d < 1000 ? 'here' : `${fmt(d)} ${compass(b).abbr}`}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <table className="calc-times nearme-times">
              <caption>Time to reach the edge</caption>
              <tbody>
                {times.map(({ tv, hours }) => (
                  <tr key={tv}>
                    <th scope="row">{TRAVEL_LABEL[tv][0].toUpperCase() + TRAVEL_LABEL[tv].slice(1)}, {SPEED[tv]} mph</th>
                    <td>{formatDuration(hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="calc-note">Rough times for a route {Math.round((DETOUR - 1) * 100)}% longer than the straight line, with no stops.</p>

            <div className="calc-actions">
              <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
              <button type="button" onClick={download}>Download image</button>
              <button type="button" onClick={() => window.print()}>Print</button>
            </div>
            {!isExample && (
              <p className="calc-note">The copied link includes this location, so share it only with people you want to see it.</p>
            )}
          </div>
        </div>
      </div>

      <div className="calc-visual">
        <div className="calc-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'map'} onClick={() => setView('map')}>Street map</button>
          <button type="button" role="tab" aria-selected={view === 'globe'} onClick={() => setView('globe')}>Globe</button>
        </div>
        <div className="calc-stage">
          <div hidden={view !== 'globe'} className="calc-globe">
            <Globe
              a={null}
              b={null}
              circles={mapCircles.map((c) => ({ ...c, label: center.name.split(',')[0] }))}
              focus={{ center, radius }}
              picking={picking ? 'a' : null}
              onPick={(_w, p, name) => pick(p, name)}
              cardActions={[{ label: 'Start from here', run: (p, name) => pick(p, name) }]}
            />
          </div>
          <div hidden={view !== 'map'} className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <RadiusMapView
                ref={mapRef}
                circles={mapCircles}
                probe={null}
                imperial={unit === 'mi'}
                picking={picking}
                visible={view === 'map'}
                onPick={(p) => pick(p)}
                onMoveCenter={(_id, p) => pick(p)}
                onResize={(_id, r) => setRadiusFromMap(r)}
                onSelect={() => undefined}
              />
            </Suspense>
          </div>
          {picking && (
            <div className="calc-picking" role="status">
              <span>Click to set the starting point</span>
              <button type="button" onClick={() => setPicking(false)}>Cancel</button>
            </div>
          )}
        </div>
        <p className="calc-hint">
          {view === 'map'
            ? 'Drag the center to move it, or drag the white handle on the edge to change the distance.'
            : 'Drag to turn, scroll or pinch to zoom, click a place to start from there.'}
        </p>
      </div>
    </div>
  );
}
