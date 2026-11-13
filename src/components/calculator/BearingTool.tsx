import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LatLon, Place, Unit } from '../../lib/geo';
import {
  compass,
  compass32,
  destination,
  formatCoord,
  formatNumber,
  geodesic,
  greatCirclePath,
  haversine,
  quadrantBearing,
  rhumbBearing,
  rhumbDistance,
  rhumbPath,
  toDMS,
  toUnit,
  UNIT_LABEL,
} from '../../lib/geo';
import Globe from './Globe';
import PlaceInput from './PlaceInput';
import { nameForPoint } from './places';
import { declination } from './magnetic';

const MapView = lazy(() => import('./MapView'));

type Mode = 'between' | 'destination';
const START: Place = { name: 'Kansas City, MO', lat: 39.0997, lon: -94.5786 };
const END: Place = { name: 'St. Louis, MO', lat: 38.627, lon: -90.1994 };
const M_PER: Record<Unit, number> = { mi: 1609.344, km: 1000, nmi: 1852 };

const EXAMPLES: [Place, Place][] = [
  [START, END],
  [{ name: 'New York, NY', lat: 40.7128, lon: -74.006 }, { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }],
  [{ name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 }, { name: 'Tokyo, Japan', lat: 35.6895, lon: 139.6917 }],
  [{ name: 'Seattle, WA', lat: 47.6062, lon: -122.3321 }, { name: 'Miami, FL', lat: 25.7743, lon: -80.1937 }],
  [{ name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, { name: 'Sydney, Australia', lat: -33.8679, lon: 151.2073 }],
];

/** Reads 45, 45.5, 45°30', N45E style input as degrees from north. */
function parseBearing(raw: string): number | null {
  const s = raw.trim().toUpperCase().replace(/,/g, '.');
  const quad = s.match(/^([NS])\s*([\d.]+)(?:\s*[°\s]\s*([\d.]+)\s*['′]?)?(?:\s*([\d.]+)\s*["″]?)?\s*([EW])$/);
  if (quad) {
    const a = Number(quad[2]) + Number(quad[3] ?? 0) / 60 + Number(quad[4] ?? 0) / 3600;
    if (a > 90) return null;
    if (quad[1] === 'N') return quad[5] === 'E' ? a : 360 - a;
    return quad[5] === 'E' ? 180 - a : 180 + a;
  }
  const dms = s.match(/^([\d.]+)\s*°?\s*(?:([\d.]+)\s*['′]\s*)?(?:([\d.]+)\s*["″]\s*)?$/);
  if (!dms) return null;
  const v = Number(dms[1]) + Number(dms[2] ?? 0) / 60 + Number(dms[3] ?? 0) / 3600;
  return Number.isFinite(v) && v >= 0 && v <= 360 ? v % 360 : null;
}

function Rose({ bearing, rhumb, magNorth }: { bearing: number; rhumb: number | null; magNorth: number | null }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <svg viewBox="-110 -110 220 220" className="bearing-rose" role="img" aria-label={`Compass showing a bearing of ${bearing.toFixed(1)} degrees`}>
      <circle r="100" className="rose-face" />
      {ticks.map((t) => (
        <line key={t} x1="0" y1={t % 45 === 0 ? -84 : t % 15 === 0 ? -89 : -93} x2="0" y2="-98" transform={`rotate(${t})`} className={t % 45 === 0 ? 'rose-tick is-major' : 'rose-tick'} />
      ))}
      {['N', 'E', 'S', 'W'].map((l, i) => (
        <text key={l} x={Math.sin((i * Math.PI) / 2) * 70} y={-Math.cos((i * Math.PI) / 2) * 70} dy="0.35em" textAnchor="middle" className={l === 'N' ? 'rose-label is-north' : 'rose-label'}>
          {l}
        </text>
      ))}
      {magNorth !== null && (
        <g transform={`rotate(${magNorth})`}>
          <path d="M0 -98 L-5 -86 L5 -86 Z" className="rose-mag" />
        </g>
      )}
      {rhumb !== null && Math.abs(((rhumb - bearing + 540) % 360) - 180) > 0.5 && (
        <g transform={`rotate(${rhumb})`}>
          <line x1="0" y1="0" x2="0" y2="-80" className="rose-rhumb" />
        </g>
      )}
      <g transform={`rotate(${bearing})`} className="rose-needle">
        <path d="M0 -82 L7 -10 L0 0 L-7 -10 Z" className="rose-needle-head" />
        <path d="M0 0 L5 30 L0 36 L-5 30 Z" className="rose-needle-tail" />
      </g>
      <circle r="5" className="rose-hub" />
    </svg>
  );
}

export default function BearingTool() {
  const [mode, setMode] = useState<Mode>('between');
  const [a, setA] = useState<Place | null>(START);
  const [b, setB] = useState<Place | null>(END);
  const [bearingText, setBearingText] = useState('45');
  const [distText, setDistText] = useState('100');
  const [unit, setUnit] = useState<Unit>('mi');
  const [view, setView] = useState<'map' | 'globe'>('map');
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const read = (k: string): Place | null => {
      const v = q.get(k)?.split(',');
      if (!v || v.length < 2) return null;
      const p = { lat: Number(v[0]), lon: Number(v[1]) };
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
      return { ...p, name: v.slice(2).join(',').slice(0, 120) || formatCoord(p) };
    };
    const qa = read('a');
    const qb = read('b');
    if (qa) setA(qa);
    if (qb) setB(qb);
    if (q.get('mode') === 'destination') setMode('destination');
    if (q.get('brg')) setBearingText(q.get('brg')!.slice(0, 20));
    if (q.get('d')) setDistText(q.get('d')!.slice(0, 12));
    const u = q.get('unit');
    if (u === 'km' || u === 'nmi' || u === 'mi') setUnit(u);
  }, []);

  const brg = parseBearing(bearingText);
  const dist = Number(distText.replace(/,/g, ''));
  const dest: Place | null = useMemo(() => {
    if (mode !== 'destination' || !a || brg === null || !(dist > 0)) return null;
    const p = destination(a, brg, Math.min(dist * M_PER[unit], 20_000_000));
    return { ...p, name: formatCoord(p) };
  }, [mode, a?.lat, a?.lon, brg, dist, unit]);

  const to = mode === 'destination' ? dest : b;
  const g = a && to ? geodesic(a, to) : null;
  const rb = a && to ? rhumbBearing(a, to) : null;
  const rd = a && to ? rhumbDistance(a, to) : null;
  const decl = a ? declination(a) : null;
  const initial = mode === 'destination' && brg !== null ? brg : g?.initialBearing ?? null;
  const magnetic = initial !== null && decl !== null ? (initial - decl + 360) % 360 : null;
  const back = g ? (g.finalBearing + 180) % 360 : null;

  useEffect(() => {
    if (!touched) return;
    window.history.replaceState(null, '', `?${query()}`);
  }, [a, b, mode, bearingText, distText, unit, touched]);

  function query() {
    const q = new URLSearchParams();
    if (a) q.set('a', `${a.lat.toFixed(5)},${a.lon.toFixed(5)},${a.name}`);
    if (mode === 'destination') {
      q.set('mode', 'destination');
      q.set('brg', bearingText);
      q.set('d', distText);
    } else if (b) q.set('b', `${b.lat.toFixed(5)},${b.lon.toFixed(5)},${b.name}`);
    if (unit !== 'mi') q.set('unit', unit);
    return q.toString();
  }

  function pick(which: 'a' | 'b', p: LatLon, known?: string) {
    setPicking(null);
    setTouched(true);
    const place = { ...p, name: known ?? formatCoord(p) };
    (which === 'a' ? setA : setB)(place);
    if (!known)
      void nameForPoint(p.lat, p.lon).then((n) => n && (which === 'a' ? setA : setB)((c) => (c && c.lat === p.lat && c.lon === p.lon ? { ...c, name: n } : c)));
  }

  async function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?${query()}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  const line = useMemo(() => (a && to ? greatCirclePath(a, to) : []), [a?.lat, a?.lon, to?.lat, to?.lon]);
  const rline = useMemo(() => (a && to && rb !== null && Math.abs(((rb - (g?.initialBearing ?? rb) + 540) % 360) - 180) > 0.3 ? rhumbPath(a, to) : null), [a?.lat, a?.lon, to?.lat, to?.lon]);
  const fmtD = (m: number) => `${formatNumber(toUnit(m, unit), toUnit(m, unit) >= 100 ? 0 : 1)} ${UNIT_LABEL[unit].short}`;

  return (
    <div className="calc calc-bearing" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Bearing calculator">
          <div className="nearme-modes" role="radiogroup" aria-label="What to work out">
            <button type="button" role="radio" aria-checked={mode === 'between'} onClick={() => { setTouched(true); setMode('between'); }}>Bearing between two points</button>
            <button type="button" role="radio" aria-checked={mode === 'destination'} onClick={() => { setTouched(true); setMode('destination'); }}>Point from a bearing</button>
          </div>
          <PlaceInput
            letter="A"
            label="Start"
            placeholder="Address, city or coordinates"
            value={a}
            onChange={(p) => { setTouched(true); setA(p); }}
            onPickOnMap={() => { setView('map'); setPicking('a'); }}
          />
          {mode === 'between' ? (
            <PlaceInput
              letter="B"
              label="Destination"
              placeholder="Address, city or coordinates"
              value={b}
              onChange={(p) => { setTouched(true); setB(p); }}
              onPickOnMap={() => { setView('map'); setPicking('b'); }}
            />
          ) : (
            <div className="bearing-inputs">
              <div>
                <label htmlFor="brg-in">Bearing</label>
                <input id="brg-in" type="text" inputMode="decimal" autoComplete="off" value={bearingText} onChange={(e) => { setTouched(true); setBearingText(e.target.value); }} aria-invalid={brg === null} />
                <small>{brg === null ? 'Try 45, 45°30′ or N45E' : `${formatNumber(brg, 2)}° true`}</small>
              </div>
              <div>
                <label htmlFor="dist-in">Distance</label>
                <div className="radius-inputs">
                  <input id="dist-in" type="text" inputMode="decimal" autoComplete="off" value={distText} onChange={(e) => { setTouched(true); setDistText(e.target.value); }} />
                  <select value={unit} onChange={(e) => { setTouched(true); setUnit(e.target.value as Unit); }} aria-label="Distance unit">
                    <option value="mi">miles</option>
                    <option value="km">km</option>
                    <option value="nmi">nautical miles</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="calc-result" aria-live="polite">
          {a && to && initial !== null && g ? (
            <>
              <div className="calc-summary bearing-summary">
                <div>
                  <p className="calc-route">
                    {mode === 'between' ? `From ${a.name.split(',')[0]} to ${to.name.split(',')[0]}` : `${formatNumber(dist, Number.isInteger(dist) ? 0 : 1)} ${UNIT_LABEL[unit].long} from ${a.name.split(',')[0]}`}
                  </p>
                  {mode === 'between' ? (
                    <>
                      <p className="calc-distance">
                        <output>{initial.toFixed(1)}°</output>
                        <span>{compass(initial).name}</span>
                      </p>
                      <p className="calc-also">
                        <strong>{toDMS(initial)} · {quadrantBearing(initial)}</strong> · {fmtD(g.distance)} away
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="bearing-dest">{formatCoord(to, 5)}</p>
                      <p className="calc-also">
                        <strong>{to.lat.toFixed(6)}, {to.lon.toFixed(6)}</strong> · heading {initial.toFixed(1)}° {compass(initial).abbr}
                      </p>
                    </>
                  )}
                </div>
                <Rose bearing={initial} rhumb={rb} magNorth={decl} />
              </div>

              <div className="calc-details">
                <dl className="calc-facts">
                  <div>
                    <dt>Initial bearing (true)</dt>
                    <dd>{initial.toFixed(2)}° {compass32(initial)}</dd>
                  </div>
                  <div>
                    <dt>Final bearing on arrival</dt>
                    <dd>{g.finalBearing.toFixed(2)}°</dd>
                  </div>
                  <div>
                    <dt>Back bearing, B to A</dt>
                    <dd>{back!.toFixed(2)}°</dd>
                  </div>
                  <div>
                    <dt>Magnetic bearing at A</dt>
                    <dd>{magnetic !== null ? `${magnetic.toFixed(1)}° M` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Declination at A</dt>
                    <dd>{decl !== null ? `${Math.abs(decl).toFixed(1)}° ${decl >= 0 ? 'east' : 'west'}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Rhumb line bearing</dt>
                    <dd>{rb!.toFixed(2)}° constant</dd>
                  </div>
                </dl>

                <table className="air-legs bearing-formats">
                  <caption>The same bearing in other formats</caption>
                  <tbody>
                    <tr><th scope="row">Degrees, minutes, seconds</th><td className="num">{toDMS(initial, 1)}</td></tr>
                    <tr><th scope="row">Quadrant (surveying)</th><td className="num">{quadrantBearing(initial)}</td></tr>
                    <tr><th scope="row">Compass point</th><td className="num">{compass32(initial)} · {compass(initial).name}</td></tr>
                    <tr><th scope="row">Mils (6,400 per circle)</th><td className="num">{formatNumber((initial * 6400) / 360, 0)} mils</td></tr>
                    <tr><th scope="row">Radians</th><td className="num">{((initial * Math.PI) / 180).toFixed(4)} rad</td></tr>
                    <tr><th scope="row">Great circle distance</th><td className="num">{fmtD(g.distance)}</td></tr>
                    <tr><th scope="row">Rhumb line distance</th><td className="num">{fmtD(rd!)} ({formatNumber(((rd! - haversine(a, to)) / haversine(a, to)) * 100, 2)}% longer)</td></tr>
                  </tbody>
                </table>
                <p className="calc-note">
                  True bearings are measured clockwise from true north on the WGS 84 ellipsoid. Magnetic values use the World Magnetic Model 2025 for today’s date at the start point.
                  {mode === 'destination' && ' The destination follows a great circle from the start on the bearing given.'}
                </p>
                <div className="calc-actions">
                  <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
                  <div className="calc-units" role="radiogroup" aria-label="Distance unit">
                    {(['mi', 'km', 'nmi'] as Unit[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => { setTouched(true); setUnit(k); }}>{UNIT_LABEL[k].short}</button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>{mode === 'between' ? 'Enter two places to see the bearing between them.' : 'Enter a start, a bearing such as 45 or N45E, and a distance.'}</p></div>
          )}
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
              a={a}
              b={to}
              labelA={a?.name.split(',')[0]}
              labelB={to?.name.split(',')[0]}
              distanceLabel={initial !== null ? `${initial.toFixed(1)}°` : undefined}
              picking={picking}
              onPick={(w, p, n) => pick(w, p, n)}
            />
          </div>
          <div hidden={view !== 'map'} className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <MapView
                a={a}
                b={to}
                labelA={a?.name.split(',')[0] ?? ''}
                labelB={to?.name.split(',')[0] ?? ''}
                distanceLabel={initial !== null ? `${initial.toFixed(1)}° ${compass(initial).abbr}` : ''}
                unit={unit}
                line={line}
                roadLine={rline}
                picking={picking}
                visible={view === 'map'}
                onPick={(w, p) => pick(w, p)}
              />
            </Suspense>
          </div>
          {picking && (
            <div className="calc-picking" role="status">
              <span>Click to set {picking === 'a' ? 'the start' : 'the destination'}</span>
              <button type="button" onClick={() => setPicking(null)}>Cancel</button>
            </div>
          )}
        </div>
        <p className="calc-hint">
          {rline ? 'Magenta dashes: the great circle, shortest path, whose bearing changes as you go. Dark line: the rhumb line, longer but on one constant compass heading.' : 'The line follows the great circle, the shortest path between the two points.'} Drag A or B to move them.
        </p>
      </div>

      <div className="calc-examples">
        <span id="examples-label-brg">Try</span>
        <ul aria-labelledby="examples-label-brg">
          {EXAMPLES.map(([x, y]) => (
            <li key={x.name + y.name}>
              <button type="button" onClick={() => { setTouched(true); setMode('between'); setA(x); setB(y); }}>
                {x.name.split(',')[0]} to {y.name.split(',')[0]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
