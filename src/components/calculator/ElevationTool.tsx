import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import { formatCoord, formatNumber, geodesic, greatCirclePath, haversine, intermediate } from '../../lib/geo';
import PlaceInput from './PlaceInput';
import type { Town } from './places';
import { loadTowns, nameForPoint } from './places';
import { elevationAt, elevationProfile } from './elevation';

const MapView = lazy(() => import('./MapView'));

type Mode = 'point' | 'profile';
type Unit = 'ft' | 'm';
const FT = 3.28084;
const START: Place = { name: 'Denver, CO', lat: 39.7392, lon: -104.9903 };
const END: Place = { name: 'Pikes Peak, CO', lat: 38.8409, lon: -105.0423 };
const SAMPLES = 120;

const EXAMPLES: { name: string; p: Place }[] = [
  { name: 'Denver', p: START },
  { name: 'Death Valley', p: { name: 'Badwater Basin, CA', lat: 36.2297, lon: -116.7672 } },
  { name: 'Mount Washington', p: { name: 'Mount Washington, NH', lat: 44.2706, lon: -71.3033 } },
  { name: 'Mexico City', p: { name: 'Mexico City, Mexico', lat: 19.4326, lon: -99.1332 } },
  { name: 'Amsterdam', p: { name: 'Amsterdam, Netherlands', lat: 52.3731, lon: 4.8922 } },
];

function nearest(p: LatLon, towns: Town[]) {
  let best: { t: Town; d: number } | null = null;
  for (const t of towns) {
    if (Math.abs(t.lat - p.lat) > 1) continue;
    const d = haversine(p, t);
    if (!best || d < best.d) best = { t, d };
  }
  return best;
}

export default function ElevationTool() {
  const [mode, setMode] = useState<Mode>('point');
  const [a, setA] = useState<Place | null>(START);
  const [b, setB] = useState<Place | null>(END);
  const [unit, setUnit] = useState<Unit>('ft');
  const [elev, setElev] = useState<{ v: number | null; error: boolean }>({ v: null, error: false });
  const [profile, setProfile] = useState<{ d: number[]; e: number[]; error: boolean; loading: boolean }>({ d: [], e: [], error: false, loading: false });
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const [towns, setTowns] = useState<Town[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const read = (k: string): Place | null => {
      const v = q.get(k)?.split(',');
      if (!v || v.length < 2) return null;
      const p = { lat: Number(v[0]), lon: Number(v[1]) };
      return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180 ? { ...p, name: v.slice(2).join(',').slice(0, 100) || formatCoord(p) } : null;
    };
    const qa = read('a');
    const qb = read('b');
    if (qa) setA(qa);
    if (qb) {
      setB(qb);
      setMode('profile');
    }
    if (q.get('unit') === 'm') setUnit('m');
    loadTowns().then(setTowns);
  }, []);

  useEffect(() => {
    if (!a) return;
    let live = true;
    setElev({ v: null, error: false });
    elevationAt(a)
      .then((v) => live && setElev({ v, error: false }))
      .catch(() => live && setElev({ v: null, error: true }));
    return () => {
      live = false;
    };
  }, [a?.lat, a?.lon]);

  const line = useMemo(() => (mode === 'profile' && a && b ? greatCirclePath(a, b) : []), [mode, a?.lat, a?.lon, b?.lat, b?.lon]);
  const length = mode === 'profile' && a && b ? geodesic(a, b).distance : 0;

  useEffect(() => {
    if (mode !== 'profile' || !a || !b) return;
    let live = true;
    const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => intermediate(a, b, i / SAMPLES));
    setProfile((p) => ({ ...p, loading: true, error: false }));
    elevationProfile(pts, length)
      .then((e) => live && setProfile({ d: pts.map((_, i) => (length * i) / SAMPLES), e, error: false, loading: false }))
      .catch(() => live && setProfile({ d: [], e: [], error: true, loading: false }));
    return () => {
      live = false;
    };
  }, [mode, a?.lat, a?.lon, b?.lat, b?.lon]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (a) q.set('a', `${a.lat.toFixed(5)},${a.lon.toFixed(5)},${a.name}`);
    if (mode === 'profile' && b) q.set('b', `${b.lat.toFixed(5)},${b.lon.toFixed(5)},${b.name}`);
    if (unit === 'm') q.set('unit', 'm');
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [a, b, mode, unit]);

  const fe = (m: number) => (unit === 'ft' ? `${formatNumber(m * FT, 0)} ft` : `${formatNumber(m, 0)} m`);
  const other = (m: number) => (unit === 'ft' ? `${formatNumber(m, 0)} m` : `${formatNumber(m * FT, 0)} ft`);
  const near = a && towns.length ? nearest(a, towns) : null;

  const summary = useMemo(() => {
    const e = profile.e;
    if (e.length < 2) return null;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < e.length; i++) {
      const d = e[i] - e[i - 1];
      if (d > 0) gain += d;
      else loss -= d;
    }
    const min = Math.min(...e);
    const max = Math.max(...e);
    const grade = length > 0 ? ((e[e.length - 1] - e[0]) / length) * 100 : 0;
    return { gain, loss, min, max, grade, iMax: e.indexOf(max), iMin: e.indexOf(min) };
  }, [profile.e, length]);

  function pick(w: 'a' | 'b', p: LatLon, known?: string) {
    setPicking(null);
    const place = { ...p, name: known ?? formatCoord(p) };
    (w === 'a' ? setA : setB)(place);
    if (!known) void nameForPoint(p.lat, p.lon).then((n) => n && (w === 'a' ? setA : setB)((c) => (c && c.lat === p.lat ? { ...c, name: n } : c)));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  }

  // Profile chart geometry.
  const W = 600, H = 200, L = 52, R = 12, T = 12, B = 30;
  const chart = useMemo(() => {
    if (!summary || profile.e.length < 2) return null;
    const span = Math.max(summary.max - summary.min, 20);
    const lo = summary.min - span * 0.1;
    const hi = summary.max + span * 0.1;
    const x = (i: number) => L + (i / (profile.e.length - 1)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const pts = profile.e.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
    return { x, y, area: `M${x(0)},${H - B} L${pts.join(' L')} L${x(profile.e.length - 1)},${H - B} Z`, line: `M${pts.join(' L')}`, ticks };
  }, [summary, profile.e]);

  return (
    <div className="calc calc-elevation" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Elevation finder">
          <div className="nearme-modes" role="radiogroup" aria-label="What to find">
            <button type="button" role="radio" aria-checked={mode === 'point'} onClick={() => setMode('point')}>Elevation of a place</button>
            <button type="button" role="radio" aria-checked={mode === 'profile'} onClick={() => setMode('profile')}>Elevation profile</button>
          </div>
          <PlaceInput letter="A" label={mode === 'point' ? 'Place' : 'Start'} placeholder="Address, city, ZIP code or coordinates" value={a} onChange={(p) => p && setA(p)} onPickOnMap={() => setPicking('a')} />
          {mode === 'profile' && (
            <PlaceInput letter="B" label="End" placeholder="Address, city or coordinates" value={b} onChange={(p) => p && setB(p)} onPickOnMap={() => setPicking('b')} />
          )}
        </form>

        <div className="calc-result" aria-live="polite">
          {a ? (
            <>
              <div className="calc-summary">
                <div className="calc-head">
                  <p className="calc-route">{mode === 'point' ? `Elevation of ${a.name.split(',')[0]}` : `${a.name.split(',')[0]} to ${b?.name.split(',')[0] ?? '…'}`}</p>
                  <div className="calc-units" role="radiogroup" aria-label="Units">
                    {(['ft', 'm'] as Unit[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => setUnit(k)}>{k}</button>
                    ))}
                  </div>
                </div>
                {mode === 'point' ? (
                  elev.error ? (
                    <p className="calc-note">The elevation data could not be loaded just now. Please try again in a moment.</p>
                  ) : elev.v === null ? (
                    <p className="calc-note">Looking up the elevation…</p>
                  ) : (
                    <>
                      <p className="calc-distance">
                        <output>{fe(elev.v)}</output>
                        <span>{elev.v < 0 ? 'below sea level' : 'above sea level'}</span>
                      </p>
                      <p className="calc-also">
                        <strong>{other(elev.v)} · </strong>
                        {formatCoord(a, 4)}
                        {near && near.d < 30000 ? ` · ${near.d < 1500 ? 'in' : `${formatNumber(near.d / 1609.344, 1)} mi from`} ${near.t.label}` : ''}
                      </p>
                    </>
                  )
                ) : summary ? (
                  <>
                    <p className="calc-distance">
                      <output>{fe(summary.max - summary.min)}</output>
                      <span>height range</span>
                    </p>
                    <p className="calc-also">
                      <strong>{`${fe(summary.min)} to ${fe(summary.max)} · `}</strong>
                      {`over ${formatNumber(length / 1609.344, length < 16093 ? 1 : 0)} mi (${formatNumber(length / 1000, length < 10000 ? 1 : 0)} km) in a straight line`}
                    </p>
                  </>
                ) : (
                  <p className="calc-note">{profile.error ? 'The elevation data could not be loaded just now.' : 'Building the profile…'}</p>
                )}
              </div>
              <div className="calc-details">
                {mode === 'profile' && chart && summary && (
                  <>
                    <svg className="elev-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Elevation profile from ${fe(profile.e[0])} to ${fe(profile.e[profile.e.length - 1])}, highest ${fe(summary.max)}`} onMouseLeave={() => setHover(null)}
                      onMouseMove={(ev) => {
                        const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
                        const fx = ((ev.clientX - r.left) / r.width) * W;
                        const i = Math.round(((fx - L) / (W - L - R)) * (profile.e.length - 1));
                        setHover(i >= 0 && i < profile.e.length ? i : null);
                      }}>
                      {chart.ticks.map((t) => (
                        <g key={t}>
                          <line x1={L} x2={W - R} y1={chart.y(t)} y2={chart.y(t)} className="elev-grid" />
                          <text x={L - 6} y={chart.y(t) + 4} textAnchor="end" className="elev-tick">{unit === 'ft' ? formatNumber(t * FT, 0) : formatNumber(t, 0)}</text>
                        </g>
                      ))}
                      <path d={chart.area} className="elev-area" />
                      <path d={chart.line} className="elev-line" />
                      <text x={L} y={H - 8} className="elev-tick">A</text>
                      <text x={W - R} y={H - 8} textAnchor="end" className="elev-tick">B</text>
                      <circle cx={chart.x(summary.iMax)} cy={chart.y(summary.max)} r="4" className="elev-peak" />
                      {hover !== null && (
                        <g>
                          <line x1={chart.x(hover)} x2={chart.x(hover)} y1={T} y2={H - B} className="elev-cursor" />
                          <circle cx={chart.x(hover)} cy={chart.y(profile.e[hover])} r="4.5" className="elev-dot" />
                        </g>
                      )}
                    </svg>
                    <p className="elev-readout" aria-live="off">
                      {hover !== null
                        ? `${formatNumber(profile.d[hover] / 1609.344, 1)} mi from A: ${fe(profile.e[hover])}`
                        : `Point at the chart to read the elevation along the line.`}
                    </p>
                    <dl className="calc-facts">
                      <div><dt>Start (A)</dt><dd>{fe(profile.e[0])}</dd></div>
                      <div><dt>End (B)</dt><dd>{fe(profile.e[profile.e.length - 1])}</dd></div>
                      <div><dt>Total climb</dt><dd>{fe(summary.gain)}</dd></div>
                      <div><dt>Total descent</dt><dd>{fe(summary.loss)}</dd></div>
                      <div><dt>Average grade A to B</dt><dd>{`${summary.grade >= 0 ? '+' : ''}${formatNumber(summary.grade, 2)}%`}</dd></div>
                      <div><dt>Highest point</dt><dd>{fe(summary.max)}</dd></div>
                    </dl>
                  </>
                )}
                {mode === 'point' && (
                  <div className="elev-examples">
                    <span>Compare</span>
                    {EXAMPLES.map((x) => (
                      <button key={x.name} type="button" onClick={() => setA(x.p)}>{x.name}</button>
                    ))}
                  </div>
                )}
                <p className="calc-note">
                  Elevation from the open Terrain Tiles dataset (SRTM, USGS 3DEP and other public sources), interpolated between grid cells about 10 to 30 m apart. Buildings and trees are not included.
                </p>
                <div className="calc-actions">
                  <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>Enter a place to find its elevation.</p></div>
          )}
        </div>
      </div>
      <div className="calc-visual">
        <div className="calc-stage">
          <div className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <MapView
                a={a}
                b={mode === 'profile' ? b : null}
                labelA={a ? `${a.name.split(',')[0]}${elev.v !== null ? ` · ${fe(elev.v)}` : ''}` : ''}
                labelB={b?.name.split(',')[0] ?? ''}
                distanceLabel={mode === 'profile' && length ? `${formatNumber(length / 1609.344, 1)} mi` : ''}
                unit="mi"
                line={line}
                roadLine={null}
                picking={picking}
                visible={true}
                onPick={(w, p) => pick(w, p)}
              />
            </Suspense>
          </div>
          {picking && (
            <div className="calc-picking" role="status">
              <span>Click the map to set {picking === 'a' ? (mode === 'point' ? 'the place' : 'the start') : 'the end'}</span>
              <button type="button" onClick={() => setPicking(null)}>Cancel</button>
            </div>
          )}
        </div>
        <p className="calc-hint">Use the map pin option in the box to click any point, or drag the pins.</p>
      </div>
    </div>
  );
}
