import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LatLon, Unit } from '../../lib/geo';
import {
  compass,
  equirectangular,
  formatCoord,
  formatNumber,
  geodesic,
  greatCirclePath,
  haversine,
  intermediate,
  lawOfCosines,
  parseAnyCoordinates,
  rhumbDistance,
  toDMS,
} from '../../lib/geo';

const MapView = lazy(() => import('./MapView'));

type Tab = 'gps' | 'xy' | 'batch';
type DUnit = Unit | 'm' | 'ft';
const UNITS: Record<DUnit, { m: number; short: string; long: string }> = {
  km: { m: 1000, short: 'km', long: 'kilometers' },
  mi: { m: 1609.344, short: 'mi', long: 'miles' },
  nmi: { m: 1852, short: 'nmi', long: 'nautical miles' },
  m: { m: 1, short: 'm', long: 'meters' },
  ft: { m: 0.3048, short: 'ft', long: 'feet' },
};
const R_KM = 6371.0088;

const EXAMPLES = [
  ['40.7128, -74.0060', '51.5074, -0.1278', 'New York to London'],
  ['34.0522, -118.2437', '37.7749, -122.4194', 'Los Angeles to San Francisco'],
  ['48.8584, 2.2945', '48.8606, 2.3376', 'Eiffel Tower to the Louvre'],
  ['33°52′S 151°12′E', '37°49′S 144°58′E', 'Sydney to Melbourne (DMS)'],
];

const dmsLat = (v: number) => `${toDMS(v, 1)} ${v >= 0 ? 'N' : 'S'}`;
const dmsLon = (v: number) => `${toDMS(v, 1)} ${v >= 0 ? 'E' : 'W'}`;

/** √n in simplest radical form, e.g. 45 -> "3√5". */
function radical(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 1e9) return null;
  const r = Math.sqrt(n);
  if (Number.isInteger(r)) return String(r);
  let out = 1;
  let rest = n;
  for (let k = Math.floor(Math.sqrt(n)); k > 1; k--) {
    if (rest % (k * k) === 0) {
      out = k;
      rest = rest / (k * k);
      break;
    }
  }
  return out === 1 ? `√${rest}` : `${out}√${rest}`;
}

const num = (s: string) => {
  const v = Number(s.replace(/,/g, '.').replace(/\s/g, '').replace('−', '-'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};
const f = (v: number, d = 4) => formatNumber(Number(v.toFixed(d)), Number.isInteger(Number(v.toFixed(d))) ? 0 : Math.min(d, (String(Number(v.toFixed(d))).split('.')[1] ?? '').length));

function parseBatch(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/[a-df-mo-rt-vx-z]/i.test(line))
    .slice(0, 500)
    .map((line) => {
      const nums = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (nums.length < 4) return { line, error: 'Needs four numbers: lat1, lon1, lat2, lon2' };
      const [la1, lo1, la2, lo2] = nums.slice(-4);
      if ([la1, la2].some((x) => Math.abs(x) > 90) || [lo1, lo2].some((x) => Math.abs(x) > 180)) return { line, error: 'Out of range' };
      const a = { lat: la1, lon: lo1 };
      const b = { lat: la2, lon: lo2 };
      const g = geodesic(a, b);
      return { line, a, b, d: g.distance, h: haversine(a, b), brg: g.initialBearing };
    });
}

export default function TwoPointsTool() {
  const [tab, setTab] = useState<Tab>('gps');
  const [aText, setAText] = useState(EXAMPLES[0][0]);
  const [bText, setBText] = useState(EXAMPLES[0][1]);
  const [unit, setUnit] = useState<DUnit>('km');
  const [xy, setXy] = useState({ x1: '2', y1: '3', x2: '8', y2: '6', z1: '', z2: '' });
  const [use3d, setUse3d] = useState(false);
  const [batch, setBatch] = useState('lat1,lon1,lat2,lon2\n40.7128,-74.0060,51.5074,-0.1278\n34.0522,-118.2437,37.7749,-122.4194\n48.8584,2.2945,48.8606,2.3376');
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('a')) setAText(q.get('a')!.slice(0, 80));
    if (q.get('b')) setBText(q.get('b')!.slice(0, 80));
    const u = q.get('unit') as DUnit | null;
    if (u && u in UNITS) setUnit(u);
    const t = q.get('tab');
    if (t === 'xy' || t === 'batch') setTab(t);
    if (t === 'xy') {
      const v = (k: string) => q.get(k) ?? '';
      setXy({ x1: v('x1') || '2', y1: v('y1') || '3', x2: v('x2') || '8', y2: v('y2') || '6', z1: v('z1'), z2: v('z2') });
      if (q.get('z1') || q.get('z2')) setUse3d(true);
    }
  }, []);

  const a = parseAnyCoordinates(aText);
  const b = parseAnyCoordinates(bText);
  const U = UNITS[unit];
  const fd = (m: number) => `${formatNumber(m / U.m, m / U.m >= 1000 ? 1 : m / U.m >= 10 ? 2 : 3)} ${U.short}`;

  const res = useMemo(() => {
    if (!a || !b) return null;
    const g = geodesic(a, b);
    const h = haversine(a, b);
    return {
      g,
      h,
      loc: lawOfCosines(a, b),
      eq: equirectangular(a, b),
      rh: rhumbDistance(a, b),
      mid: intermediate(a, b, 0.5),
      dLat: b.lat - a.lat,
      dLon: b.lon - a.lon,
    };
  }, [a?.lat, a?.lon, b?.lat, b?.lon]);

  // Worked haversine steps with the actual numbers.
  const steps = useMemo(() => {
    if (!a || !b) return null;
    const r = (d: number) => (d * Math.PI) / 180;
    const p1 = r(a.lat), p2 = r(b.lat), dp = r(b.lat - a.lat), dl = r(b.lon - a.lon);
    const hv = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(hv)));
    return { p1, p2, dp, dl, hv, c, d: R_KM * c };
  }, [a?.lat, a?.lon, b?.lat, b?.lon]);

  const X = { x1: num(xy.x1), y1: num(xy.y1), x2: num(xy.x2), y2: num(xy.y2), z1: num(xy.z1) ?? 0, z2: num(xy.z2) ?? 0 };
  const xyOk = X.x1 !== null && X.y1 !== null && X.x2 !== null && X.y2 !== null;
  const dx = xyOk ? X.x2! - X.x1! : 0;
  const dy = xyOk ? X.y2! - X.y1! : 0;
  const dz = use3d ? X.z2 - X.z1 : 0;
  const sumSq = dx * dx + dy * dy + dz * dz;
  const dxy = Math.sqrt(sumSq);
  const exact = Number.isInteger(dx) && Number.isInteger(dy) && Number.isInteger(dz) ? radical(sumSq) : null;

  const rows = useMemo(() => (tab === 'batch' ? parseBatch(batch) : []), [batch, tab]);

  function setQuery(extra: Record<string, string>) {
    const q = new URLSearchParams(extra);
    if (unit !== 'km') q.set('unit', unit);
    window.history.replaceState(null, '', `?${q.toString()}`);
  }
  useEffect(() => {
    if (tab === 'gps') setQuery({ a: aText, b: bText });
    else if (tab === 'xy') setQuery({ tab: 'xy', ...Object.fromEntries(Object.entries(xy).filter(([k, v]) => v && (use3d || !k.startsWith('z')))) });
    else setQuery({ tab: 'batch' });
  }, [tab, aText, bText, unit, xy, use3d]);

  async function copy(text: string, kind: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  function downloadCsv() {
    const head = `lat1,lon1,lat2,lon2,distance_${U.short}_wgs84,distance_${U.short}_haversine,initial_bearing_deg`;
    const body = rows
      .map((r) => ('d' in r && r.a ? [r.a.lat, r.a.lon, r.b!.lat, r.b!.lon, (r.d! / U.m).toFixed(4), (r.h! / U.m).toFixed(4), r.brg!.toFixed(2)].join(',') : `"${r.line.replace(/"/g, '""')}",,,,ERROR`))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`${head}\n${body}\n`], { type: 'text/csv' }));
    const el = document.createElement('a');
    el.href = url;
    el.download = 'distances.csv';
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const line = useMemo(() => (a && b ? greatCirclePath(a, b) : []), [a?.lat, a?.lon, b?.lat, b?.lon]);
  const unitButtons = (
    <div className="calc-units" role="radiogroup" aria-label="Units">
      {(Object.keys(UNITS) as DUnit[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => setUnit(k)}>
          {UNITS[k].short}
        </button>
      ))}
    </div>
  );

  // Plot for the x, y tab.
  const plot = (() => {
    if (!xyOk) return null;
    const xs = [X.x1!, X.x2!, 0];
    const ys = [X.y1!, X.y2!, 0];
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 1) * 1.25;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const S = 300 / span;
    const px = (x: number) => 160 + (x - cx) * S;
    const py = (y: number) => 160 - (y - cy) * S;
    return { px, py, S };
  })();

  return (
    <div className={`calc calc-points${tab === 'gps' ? '' : ' calc-points-wide'}`} id="calculator">
      <div className="calc-tabs calc-tabs-top" role="tablist" aria-label="Kind of points">
        <button type="button" role="tab" aria-selected={tab === 'gps'} onClick={() => setTab('gps')}>Latitude &amp; longitude</button>
        <button type="button" role="tab" aria-selected={tab === 'xy'} onClick={() => setTab('xy')}>x, y coordinates</button>
        <button type="button" role="tab" aria-selected={tab === 'batch'} onClick={() => setTab('batch')}>Many pairs</button>
      </div>

      {tab === 'gps' && (
        <>
          <div className="calc-inputs">
            <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Distance between two GPS coordinates">
              {([['a', aText, setAText, 'Point A'], ['b', bText, setBText, 'Point B']] as const).map(([k, val, set, label]) => {
                const p = k === 'a' ? a : b;
                return (
                  <div className="coord-field" key={k}>
                    <label htmlFor={`pt-${k}`}>
                      <span className="place-letter" aria-hidden="true">{k.toUpperCase()}</span>
                      {label}
                    </label>
                    <div className="coord-row">
                      <input id={`pt-${k}`} type="text" autoComplete="off" spellCheck={false} value={val} onChange={(e) => set(e.target.value)} aria-invalid={val.trim() !== '' && !p} aria-describedby={`pt-${k}-hint`} placeholder="40.7128, -74.0060 or 40°42′46″N 74°00′22″W" />
                      <button type="button" className="coord-pick" onClick={() => setPicking(k)} aria-label={`Pick ${label} on the map`}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>
                      </button>
                    </div>
                    <small id={`pt-${k}-hint`} className={val.trim() !== '' && !p ? 'is-error' : undefined}>
                      {p ? `${dmsLat(p.lat)}, ${dmsLon(p.lon)}` : val.trim() ? 'Could not read these coordinates. Try 40.7128, -74.0060' : 'Decimal degrees, degrees and minutes, or DMS'}
                    </small>
                  </div>
                );
              })}
              <button type="button" className="coord-swap" onClick={() => { setAText(bText); setBText(aText); }}>⇅ Swap A and B</button>
            </form>

            <div className="calc-result" aria-live="polite">
              {res && a && b ? (
                <>
                  <div className="calc-summary">
                    <div className="calc-head">
                      <p className="calc-route">Ellipsoid distance (WGS 84)</p>
                      {unitButtons}
                    </div>
                    <p className="calc-distance">
                      <output>{formatNumber(res.g.distance / U.m, res.g.distance / U.m >= 1000 ? 1 : res.g.distance / U.m >= 10 ? 2 : 3)}</output>
                      <span>{U.long}</span>
                    </p>
                    <p className="calc-also">
                      <strong>Bearing {res.g.initialBearing.toFixed(1)}° {compass(res.g.initialBearing).abbr} · </strong>
                      {(['km', 'mi', 'nmi'] as DUnit[]).filter((k) => k !== unit).map((k) => `${formatNumber(res.g.distance / UNITS[k].m, 2)} ${UNITS[k].short}`).join(' · ')}
                    </p>
                  </div>
                  <div className="calc-details">
                    <table className="air-legs">
                      <caption>Compared with other formulas</caption>
                      <tbody>
                        <tr><th scope="row">Vincenty, WGS 84 ellipsoid</th><td className="num">{fd(res.g.distance)}</td><td className="num muted">reference</td></tr>
                        <tr><th scope="row">Haversine, sphere</th><td className="num">{fd(res.h)}</td><td className="num muted">{formatNumber(((res.h - res.g.distance) / res.g.distance) * 100, 3)}%</td></tr>
                        <tr><th scope="row">Spherical law of cosines</th><td className="num">{fd(res.loc)}</td><td className="num muted">{formatNumber(((res.loc - res.g.distance) / res.g.distance) * 100, 3)}%</td></tr>
                        <tr><th scope="row">Flat (equirectangular)</th><td className="num">{fd(res.eq)}</td><td className="num muted">{formatNumber(((res.eq - res.g.distance) / res.g.distance) * 100, 3)}%</td></tr>
                        <tr><th scope="row">Rhumb line, constant heading</th><td className="num">{fd(res.rh)}</td><td className="num muted">{formatNumber(((res.rh - res.g.distance) / res.g.distance) * 100, 3)}%</td></tr>
                      </tbody>
                    </table>
                    <dl className="calc-facts">
                      <div><dt>Δ latitude</dt><dd>{f(res.dLat, 5)}°</dd></div>
                      <div><dt>Δ longitude</dt><dd>{f(res.dLon, 5)}°</dd></div>
                      <div><dt>Final bearing</dt><dd>{res.g.finalBearing.toFixed(1)}°</dd></div>
                      <div><dt>Midpoint</dt><dd>{formatCoord(res.mid, 4)}</dd></div>
                    </dl>
                    {steps && (
                      <details className="coord-steps">
                        <summary>Show the haversine working</summary>
                        <ol>
                          <li>Convert to radians: φ1 = {steps.p1.toFixed(6)}, φ2 = {steps.p2.toFixed(6)}, Δφ = {steps.dp.toFixed(6)}, Δλ = {steps.dl.toFixed(6)}</li>
                          <li>a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2) = {steps.hv.toFixed(8)}</li>
                          <li>c = 2 · asin(√a) = {steps.c.toFixed(8)} radians</li>
                          <li>d = R · c = 6,371.0088 km × {steps.c.toFixed(8)} = <strong>{formatNumber(steps.d, 3)} km</strong></li>
                        </ol>
                      </details>
                    )}
                    <div className="calc-actions">
                      <button type="button" onClick={() => copy(window.location.href, 'link')}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
                      <button type="button" onClick={() => copy(`${(res.g.distance / U.m).toFixed(4)} ${U.short}`, 'value')}>{copied === 'value' ? 'Copied' : 'Copy distance'}</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="calc-empty"><p>Enter two sets of coordinates to measure the distance between them.</p></div>
              )}
            </div>
          </div>
          <div className="calc-visual">
            <div className="calc-stage">
              <div className="calc-map">
                <Suspense fallback={<p className="map-status">Loading the map…</p>}>
                  <MapView
                    a={a}
                    b={b}
                    labelA="Point A"
                    labelB="Point B"
                    distanceLabel={res ? fd(res.g.distance) : ''}
                    unit={unit === 'mi' || unit === 'ft' ? 'mi' : unit === 'nmi' ? 'nmi' : 'km'}
                    line={line}
                    roadLine={null}
                    picking={picking}
                    visible={true}
                    onPick={(w, p: LatLon) => {
                      setPicking(null);
                      (w === 'a' ? setAText : setBText)(`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`);
                    }}
                  />
                </Suspense>
              </div>
              {picking && (
                <div className="calc-picking" role="status">
                  <span>Click to place point {picking.toUpperCase()}</span>
                  <button type="button" onClick={() => setPicking(null)}>Cancel</button>
                </div>
              )}
            </div>
            <p className="calc-hint">Drag A or B, or use the pin buttons to click a point. Coordinates update to six decimal places, about 10 cm.</p>
          </div>
          <div className="calc-examples">
            <span id="examples-label-pts">Try</span>
            <ul aria-labelledby="examples-label-pts">
              {EXAMPLES.map(([x, y, n]) => (
                <li key={n}><button type="button" onClick={() => { setAText(x); setBText(y); }}>{n}</button></li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'xy' && (
        <div className="xy-wrap">
          <form className="calc-form xy-form" onSubmit={(e) => e.preventDefault()} aria-label="Distance between two points on a graph">
            {(['1', '2'] as const).map((i) => (
              <fieldset key={i}>
                <legend>Point {i === '1' ? 'A' : 'B'} (x{i === '1' ? '₁' : '₂'}, y{i === '1' ? '₁' : '₂'}{use3d ? `, z${i === '1' ? '₁' : '₂'}` : ''})</legend>
                {(['x', 'y', ...(use3d ? ['z'] : [])] as const).map((c) => {
                  const key = `${c}${i}` as keyof typeof xy;
                  return (
                    <label key={key}>
                      <span>{c}{i === '1' ? '₁' : '₂'}</span>
                      <input type="text" inputMode="decimal" value={xy[key]} onChange={(e) => setXy({ ...xy, [key]: e.target.value })} aria-invalid={xy[key].trim() !== '' && num(xy[key]) === null} />
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <label className="air-check"><input type="checkbox" checked={use3d} onChange={(e) => setUse3d(e.target.checked)} /> Add a z coordinate (3D)</label>
          </form>
          {xyOk ? (
            <div className="xy-result">
              <p className="calc-route">Distance from A to B</p>
              <p className="calc-distance">
                <output>{exact && !/^\d+$/.test(exact) ? exact : f(dxy, 6)}</output>
                {exact && !/^\d+$/.test(exact) && <span>≈ {f(dxy, 6)}</span>}
              </p>
              <ol className="xy-steps">
                <li>Differences: Δx = {f(X.x2!)} − {f(X.x1!)} = <b>{f(dx)}</b>, Δy = {f(X.y2!)} − {f(X.y1!)} = <b>{f(dy)}</b>{use3d && <>, Δz = {f(X.z2)} − {f(X.z1)} = <b>{f(dz)}</b></>}</li>
                <li>Square them: {f(dx)}² = {f(dx * dx)}, {f(dy)}² = {f(dy * dy)}{use3d && <>, {f(dz)}² = {f(dz * dz)}</>}</li>
                <li>Add: {f(dx * dx)} + {f(dy * dy)}{use3d && <> + {f(dz * dz)}</>} = <b>{f(sumSq)}</b></li>
                <li>Square root: d = √{f(sumSq)} = <b>{exact && !/^\d+$/.test(exact) ? `${exact} ≈ ` : ''}{f(dxy, 6)}</b></li>
              </ol>
              <dl className="calc-facts">
                <div><dt>Midpoint</dt><dd>({f((X.x1! + X.x2!) / 2)}, {f((X.y1! + X.y2!) / 2)}{use3d ? `, ${f((X.z1 + X.z2) / 2)}` : ''})</dd></div>
                {!use3d && <div><dt>Slope</dt><dd>{dx === 0 ? 'undefined (vertical)' : f(dy / dx)}</dd></div>}
                {!use3d && <div><dt>Angle from the x-axis</dt><dd>{f((Math.atan2(dy, dx) * 180) / Math.PI, 2)}°</dd></div>}
                <div><dt>Manhattan distance</dt><dd>{f(Math.abs(dx) + Math.abs(dy) + Math.abs(dz))}</dd></div>
              </dl>
              <div className="calc-actions">
                <button type="button" onClick={() => copy(window.location.href, 'link')}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
              </div>
            </div>
          ) : (
            <div className="calc-empty"><p>Enter x and y for both points.</p></div>
          )}
          {xyOk && plot && !use3d && (
            <svg className="xy-plot" viewBox="0 0 320 320" role="img" aria-label={`Points A (${xy.x1}, ${xy.y1}) and B (${xy.x2}, ${xy.y2}) on a graph with the distance between them`}>
              <rect width="320" height="320" rx="14" className="xy-bg" />
              <line x1="0" x2="320" y1={plot.py(0)} y2={plot.py(0)} className="xy-axis" />
              <line y1="0" y2="320" x1={plot.px(0)} x2={plot.px(0)} className="xy-axis" />
              <path d={`M${plot.px(X.x1!)} ${plot.py(X.y1!)} H${plot.px(X.x2!)} V${plot.py(X.y2!)}`} className="xy-legs" />
              <line x1={plot.px(X.x1!)} y1={plot.py(X.y1!)} x2={plot.px(X.x2!)} y2={plot.py(X.y2!)} className="xy-line" />
              <text x={(plot.px(X.x1!) + plot.px(X.x2!)) / 2} y={plot.py(X.y1!) + (dy >= 0 ? 16 : -8)} textAnchor="middle" className="xy-note">Δx = {f(dx)}</text>
              <text x={plot.px(X.x2!) + (dx >= 0 ? 8 : -8)} y={(plot.py(X.y1!) + plot.py(X.y2!)) / 2} textAnchor={dx >= 0 ? 'start' : 'end'} className="xy-note">Δy = {f(dy)}</text>
              <circle cx={plot.px(X.x1!)} cy={plot.py(X.y1!)} r="7" className="xy-pt" />
              <circle cx={plot.px(X.x2!)} cy={plot.py(X.y2!)} r="7" className="xy-pt" />
              <text x={plot.px(X.x1!) - 10} y={plot.py(X.y1!) - 10} textAnchor="end" className="xy-label">A</text>
              <text x={plot.px(X.x2!) + 10} y={plot.py(X.y2!) - 10} className="xy-label">B</text>
            </svg>
          )}
        </div>
      )}

      {tab === 'batch' && (
        <div className="batch-wrap">
          <div className="batch-head">
            <label htmlFor="batch-in">Paste one pair per line: lat1, lon1, lat2, lon2 (up to 500 lines)</label>
            {unitButtons}
          </div>
          <textarea id="batch-in" rows={7} value={batch} onChange={(e) => setBatch(e.target.value)} spellCheck={false} />
          <div className="table-scroll">
            <table className="batch-table">
              <thead><tr><th scope="col">#</th><th scope="col">Point A</th><th scope="col">Point B</th><th scope="col" className="num">Distance (WGS 84)</th><th scope="col" className="num">Haversine</th><th scope="col" className="num">Bearing</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    {'error' in r && r.error ? (
                      <td colSpan={5} className="is-error">{r.error}: <code>{r.line.slice(0, 60)}</code></td>
                    ) : (
                      <>
                        <td>{formatCoord(r.a!, 4)}</td>
                        <td>{formatCoord(r.b!, 4)}</td>
                        <td className="num">{fd(r.d!)}</td>
                        <td className="num">{fd(r.h!)}</td>
                        <td className="num">{r.brg!.toFixed(1)}°</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="calc-actions">
            <button type="button" onClick={downloadCsv} disabled={!rows.length}>Download CSV</button>
            <span className="calc-note">Calculated in your browser. Nothing is uploaded.</span>
          </div>
        </div>
      )}
    </div>
  );
}
