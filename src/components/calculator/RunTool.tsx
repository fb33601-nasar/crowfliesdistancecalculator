import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import { formatNumber } from '../../lib/geo';
import PlaceInput from './PlaceInput';
import { getRoute } from './routing';
import type { RunMapHandle } from './RunMapView';
import { clock, decodePolyline, encodePolyline, markersAlong, parseClock, pathLength, toGpx } from './runroute';

const RunMapView = lazy(() => import('./RunMapView'));

type Unit = 'mi' | 'km';
const M: Record<Unit, number> = { mi: 1609.344, km: 1000 };
const MAX_POINTS = 300;

/** An example loop in Central Park, New York, so the page opens with a route. */
const EXAMPLE: LatLon[] = [
  { lat: 40.7681, lon: -73.9819 },
  { lat: 40.7712, lon: -73.9789 },
  { lat: 40.7771, lon: -73.9745 },
  { lat: 40.7852, lon: -73.9686 },
  { lat: 40.7944, lon: -73.9619 },
  { lat: 40.7968, lon: -73.9563 },
  { lat: 40.7881, lon: -73.9554 },
  { lat: 40.7786, lon: -73.9624 },
  { lat: 40.7685, lon: -73.9698 },
  { lat: 40.7647, lon: -73.9727 },
  { lat: 40.7681, lon: -73.9819 },
];

const RACES: [string, number][] = [
  ['5K', 5000],
  ['10K', 10000],
  ['Half marathon', 21097.5],
  ['Marathon', 42195],
];

const segKey = (a: LatLon, b: LatLon) => `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;

export default function RunTool() {
  const [points, setPoints] = useState<LatLon[]>(EXAMPLE);
  const [history, setHistory] = useState<LatLon[][]>([]);
  const [snap, setSnap] = useState(false);
  const [outBack, setOutBack] = useState(false);
  const [unit, setUnit] = useState<Unit>('mi');
  const [timeText, setTimeText] = useState('');
  const [segs, setSegs] = useState<Record<string, [number, number][] | 'none'>>({});
  const [pending, setPending] = useState(0);
  const [isExample, setIsExample] = useState(true);
  const [copied, setCopied] = useState('');
  const [search, setSearch] = useState<Place | null>(null);
  const mapRef = useRef<RunMapHandle>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('r');
    if (r) {
      const pts = decodePolyline(r, MAX_POINTS);
      if (pts.length) {
        setPoints(pts);
        setIsExample(false);
      }
    }
    if (q.get('snap') === '1') setSnap(true);
    if (q.get('ob') === '1') setOutBack(true);
    if (q.get('unit') === 'km') setUnit('km');
    if (q.get('t')) setTimeText(q.get('t')!.slice(0, 10));
  }, []);

  useEffect(() => {
    if (isExample) return;
    const q = new URLSearchParams();
    if (points.length) q.set('r', encodePolyline(points));
    if (snap) q.set('snap', '1');
    if (outBack) q.set('ob', '1');
    if (unit === 'km') q.set('unit', 'km');
    if (timeText) q.set('t', timeText);
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [points, snap, outBack, unit, timeText, isExample]);

  // Fetch footpath routes for each leg when snapping is on.
  useEffect(() => {
    if (!snap) return;
    let live = true;
    const todo: [LatLon, LatLon][] = [];
    for (let i = 1; i < points.length; i++) if (!(segKey(points[i - 1], points[i]) in segs)) todo.push([points[i - 1], points[i]]);
    if (!todo.length) return;
    setPending(todo.length);
    (async () => {
      for (const [a, b] of todo) {
        let line: [number, number][] | 'none' = 'none';
        try {
          const r = await getRoute('foot', a, b);
          if (r && r.line.length > 1) line = r.line;
        } catch {
          line = 'none';
        }
        if (!live) return;
        setSegs((s) => ({ ...s, [segKey(a, b)]: line }));
        setPending((n) => Math.max(0, n - 1));
      }
    })();
    return () => {
      live = false;
      setPending(0);
    };
  }, [snap, points]);

  const line = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) {
        out.push([p.lon, p.lat]);
        continue;
      }
      const s = snap ? segs[segKey(points[i - 1], p)] : undefined;
      if (s && s !== 'none') out.push(...s.slice(1), [p.lon, p.lat]);
      else out.push([p.lon, p.lat]);
    }
    return out;
  }, [points, segs, snap]);

  const oneWay = pathLength(line);
  const total = outBack ? oneWay * 2 : oneWay;
  const fullLine = useMemo(() => (outBack ? [...line, ...[...line].reverse().slice(1)] : line), [line, outBack]);
  const markers = useMemo(() => (total > 0 ? markersAlong(fullLine, M[unit], 150).map((m) => ({ p: m.p, label: String(m.n) })) : []), [fullLine, unit, total]);

  const secs = parseClock(timeText);
  const u = M[unit];
  const pace = secs && total > 0 ? secs / (total / u) : null;
  const speed = secs && total > 0 ? total / u / (secs / 3600) : null;
  const other: Unit = unit === 'mi' ? 'km' : 'mi';

  function change(next: LatLon[]) {
    setHistory((h) => [...h.slice(-50), points]);
    setPoints(next.slice(0, MAX_POINTS));
    setIsExample(false);
  }
  const add = (p: LatLon) => change(isExample ? [p] : [...points, p]);
  const move = (i: number, p: LatLon) => change(points.map((x, j) => (j === i ? p : x)));
  const remove = (i: number) => change(points.filter((_, j) => j !== i));
  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setPoints(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  async function copy(text: string, kind: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
  function gpx() {
    const url = URL.createObjectURL(new Blob([toGpx(fullLine, `Route ${formatNumber(total / u, 2)} ${unit}`)], { type: 'application/gpx+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `route-${formatNumber(total / u, 2).replace(/[^\d.]/g, '')}${unit}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const near = RACES.map(([n, m]) => ({ n, m, pct: (total / m) * 100 }));

  return (
    <div className="calc calc-run" id="calculator">
      <div className="calc-inputs">
        <div className="calc-form">
          <PlaceInput
            letter="⌕"
            label="Go to a place"
            pickLabel="Show where I am"
            placeholder="Park, street, town or ZIP code"
            value={search}
            onChange={(p) => {
              setSearch(p);
              if (p) mapRef.current?.flyTo(p);
            }}
            onPickOnMap={() => mapRef.current?.locate()}
          />
          <div className="run-tools" role="toolbar" aria-label="Route tools">
            <button type="button" onClick={() => mapRef.current?.locate()}>◎ My location</button>
            <button type="button" onClick={undo} disabled={!history.length}>↶ Undo</button>
            <button type="button" onClick={() => change([])} disabled={!points.length}>Clear</button>
            <button type="button" onClick={() => points.length > 1 && change([...points, points[0]])} disabled={points.length < 2}>↺ Back to start</button>
          </div>
          <div className="run-toggles">
            <label className="air-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Follow paths and roads</label>
            <label className="air-check"><input type="checkbox" checked={outBack} onChange={(e) => setOutBack(e.target.checked)} /> Out and back</label>
          </div>
          {snap && pending > 0 && <p className="calc-note" role="status">Finding paths… {pending} {pending === 1 ? 'leg' : 'legs'} to go</p>}
        </div>

        <div className="calc-result" aria-live="polite">
          <div className="calc-summary">
            <div className="calc-head">
              <p className="calc-route">{isExample ? 'Example: a loop in Central Park' : points.length < 2 ? 'Click the map to start your route' : 'Your route'}</p>
              <div className="calc-units" role="radiogroup" aria-label="Units">
                {(['mi', 'km'] as Unit[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => setUnit(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <p className="calc-distance">
              <output>{formatNumber(total / u, 2)}</output>
              <span>{unit === 'mi' ? 'miles' : 'kilometers'}</span>
            </p>
            <p className="calc-also">
              <strong>{formatNumber(total / M[other], 2)} {other}</strong> · {formatNumber(total, 0)} m · {points.length} {points.length === 1 ? 'point' : 'points'}
              {outBack ? ' · there and back' : ''}
            </p>
          </div>

          <div className="calc-details">
            <div className="run-time">
              <label htmlFor="run-time">Your time</label>
              <input id="run-time" type="text" inputMode="numeric" placeholder="e.g. 27:30 or 1:05:00" value={timeText} onChange={(e) => setTimeText(e.target.value)} aria-invalid={timeText !== '' && secs === null} />
            </div>
            <dl className="calc-facts">
              <div>
                <dt>Pace</dt>
                <dd>{pace ? `${clock(pace)} /${unit}` : '—'}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{speed ? `${formatNumber(speed, 1)} ${unit === 'mi' ? 'mph' : 'km/h'}` : '—'}</dd>
              </div>
              <div>
                <dt>Pace per {other}</dt>
                <dd>{secs && total > 0 ? `${clock(secs / (total / M[other]))} /${other}` : '—'}</dd>
              </div>
            </dl>
            {total > 0 && (
              <div className="run-races">
                <p className="radius-places-head">Compared with race distances</p>
                <ul>
                  {near.map((r) => (
                    <li key={r.n}>
                      <span>{r.n}</span>
                      <span className="bar"><span style={{ width: `${Math.min(r.pct, 100)}%` }} /></span>
                      <span>{r.pct >= 100 ? `${formatNumber(r.pct / 100, 1)}×` : `${formatNumber(r.pct, 0)}%`}</span>
                    </li>
                  ))}
                </ul>
                {pace && (
                  <p className="calc-note">
                    {`At this pace a 5K takes ${clock((pace * 5000) / u)}, a 10K ${clock((pace * 10000) / u)} and a half marathon ${clock((pace * 21097.5) / u)}.`}
                  </p>
                )}
              </div>
            )}
            <div className="calc-actions">
              <button type="button" onClick={() => copy(`${window.location.origin}${window.location.pathname}?r=${encodePolyline(points)}${snap ? '&snap=1' : ''}${outBack ? '&ob=1' : ''}${unit === 'km' ? '&unit=km' : ''}`, 'link')} disabled={points.length < 2}>
                {copied === 'link' ? 'Link copied' : 'Copy link'}
              </button>
              <button type="button" onClick={gpx} disabled={points.length < 2}>Download GPX</button>
            </div>
          </div>
        </div>
      </div>

      <div className="calc-visual">
        <div className="calc-stage">
          <div className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <RunMapView ref={mapRef} points={points} line={fullLine} markers={markers} imperial={unit === 'mi'} onAdd={add} onMove={move} onRemove={remove} />
            </Suspense>
          </div>
        </div>
        <p className="calc-hint">Click the map to add points along the way you went. Drag a point to move it, double-click it to remove it. Numbered dots mark each {unit === 'mi' ? 'mile' : 'kilometer'}.</p>
      </div>
    </div>
  );
}
