import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import { formatCoord, formatNumber, haversine, METRES_PER_SQ_MILE } from '../../lib/geo';
import PlaceInput from './PlaceInput';
import type { Town } from './places';
import { loadTowns } from './places';
import type { Band, Costing } from './isochrone';
import { area, contains, estimatedBands, getIsochrones, reach } from './isochrone';
import { BAND_COLORS } from './DriveTimeMapView';

const DriveTimeMapView = lazy(() => import('./DriveTimeMapView'));

const TIMES: Record<Costing, number[]> = {
  auto: [10, 15, 20, 30, 45, 60, 90, 120],
  bicycle: [10, 15, 20, 30, 45, 60, 90, 120],
  pedestrian: [5, 10, 15, 20, 30, 45, 60],
};
const DEFAULTS: Record<Costing, number[]> = { auto: [15, 30, 45, 60], bicycle: [15, 30, 45, 60], pedestrian: [10, 20, 30] };
const LABEL: Record<Costing, string> = { auto: 'Driving', bicycle: 'Cycling', pedestrian: 'Walking' };
const START: Place = { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 };

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok' } | { kind: 'fallback'; message: string };

export default function DriveTimeTool({ initialMinutes }: { initialMinutes?: number[] }) {
  const [place, setPlace] = useState<Place | null>(START);
  const [costing, setCosting] = useState<Costing>('auto');
  const [times, setTimes] = useState<number[]>(initialMinutes ?? DEFAULTS.auto);
  const [bands, setBands] = useState<Band[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [unit, setUnit] = useState<'mi' | 'km'>('mi');
  const [towns, setTowns] = useState<Town[]>([]);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const at = q.get('at')?.split(',');
    if (at && at.length >= 2 && at.slice(0, 2).every((v) => Number.isFinite(Number(v)))) {
      const p = { lat: Number(at[0]), lon: Number(at[1]) };
      if (Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) setPlace({ ...p, name: at.slice(2).join(',').slice(0, 100) || formatCoord(p) });
    }
    const by = q.get('by');
    if (by === 'auto' || by === 'bicycle' || by === 'pedestrian') setCosting(by);
    const t = q.get('t')?.split(',').map(Number).filter((n) => n > 0 && n <= 120).slice(0, 4);
    if (t?.length) setTimes(t);
    if (q.get('unit') === 'km') setUnit('km');
    loadTowns().then(setTowns);
  }, []);

  useEffect(() => {
    if (!place || !times.length) return;
    const ctrl = new AbortController();
    setStatus({ kind: 'loading' });
    getIsochrones(place, costing, times, ctrl.signal)
      .then((b) => {
        setBands(b);
        setStatus({ kind: 'ok' });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setBands(estimatedBands(place, costing, times));
        setStatus({ kind: 'fallback', message: String(e).includes('429') ? 'The drive time service is busy.' : 'The drive time service could not be reached.' });
      });
    const q = new URLSearchParams({ at: `${place.lat.toFixed(5)},${place.lon.toFixed(5)},${place.name}`, by: costing, t: [...times].sort((a, b) => a - b).join(',') });
    if (unit === 'km') q.set('unit', 'km');
    window.history.replaceState(null, '', `?${q.toString()}`);
    return () => ctrl.abort();
  }, [place?.lat, place?.lon, costing, times.join(',')]);

  function toggle(t: number) {
    setTimes((cur) => {
      if (cur.includes(t)) return cur.length > 1 ? cur.filter((x) => x !== t) : cur;
      const next = [...cur, t].sort((a, b) => a - b);
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
  }
  function switchMode(c: Costing) {
    setCosting(c);
    setTimes(DEFAULTS[c]);
  }

  const stats = useMemo(
    () =>
      bands.map((b) => {
        const a = area(b.geometry);
        const inside = place && towns.length ? towns.filter((t) => Math.abs(t.lat - place.lat) < 3 && contains(b.geometry, t)) : [];
        inside.sort((x, y) => y.population - x.population);
        return { b, a, reach: place ? reach(b.geometry, place) : 0, towns: inside };
      }),
    [bands, towns, place?.lat, place?.lon],
  );

  const fa = (m2: number) => (unit === 'mi' ? `${formatNumber(m2 / METRES_PER_SQ_MILE, m2 / METRES_PER_SQ_MILE < 10 ? 1 : 0)} sq mi` : `${formatNumber(m2 / 1e6, m2 / 1e6 < 10 ? 1 : 0)} km²`);
  const fd = (m: number) => (unit === 'mi' ? `${formatNumber(m / 1609.344, m < 16093 ? 1 : 0)} mi` : `${formatNumber(m / 1000, m < 10000 ? 1 : 0)} km`);
  const top = stats[stats.length - 1];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  }

  return (
    <div className="calc calc-drivetime" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Drive time map">
          <PlaceInput letter="●" label="Start from" pickLabel="Pick the start on the map" placeholder="Address, city, ZIP code or coordinates" value={place} onChange={(p) => p && setPlace(p)} onPickOnMap={() => setPicking(true)} />
          <div className="nearme-modes" role="radiogroup" aria-label="Travel by">
            {(Object.keys(LABEL) as Costing[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={costing === c} onClick={() => switchMode(c)}>{LABEL[c]}</button>
            ))}
          </div>
          <div className="radius-row">
            <span className="dt-label" id="dt-times">Travel times (up to four)</span>
            <div className="radius-presets" role="group" aria-labelledby="dt-times">
              {TIMES[costing].map((t) => (
                <button key={t} type="button" aria-pressed={times.includes(t)} onClick={() => toggle(t)}>
                  {t < 60 ? `${t} min` : `${t / 60} h`}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {place ? (
            <>
              <div className="calc-summary">
                <div className="calc-head">
                  <p className="calc-route">{`${LABEL[costing]} from ${place.name.split(',')[0]}`}</p>
                  <div className="calc-units" role="radiogroup" aria-label="Units">
                    {(['mi', 'km'] as const).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => setUnit(k)}>{k}</button>
                    ))}
                  </div>
                </div>
                {status.kind === 'loading' && !bands.length ? (
                  <p className="calc-note">Working out travel times along the roads…</p>
                ) : top ? (
                  <>
                    <p className="calc-distance">
                      <output>{fa(top.a)}</output>
                    </p>
                    <p className="calc-also">
                      <strong>{`within ${top.b.minutes} minutes${top.b.estimated ? ' (estimated)' : ''} · `}</strong>
                      {`reaching up to ${fd(top.reach)} away in a straight line`}
                    </p>
                  </>
                ) : null}
                {status.kind === 'fallback' && (
                  <p className="calc-note dt-fallback" role="status">{`${status.message} Showing estimated circles at typical speeds instead; try again in a minute for the real road-based areas.`}</p>
                )}
              </div>
              <div className="calc-details">
                <table className="air-legs dt-table">
                  <caption>Area reachable in each time</caption>
                  <thead><tr><th scope="col">Time</th><th scope="col" className="num">Area</th><th scope="col" className="num">Farthest reach</th><th scope="col" className="num">Towns inside</th></tr></thead>
                  <tbody>
                    {stats.map((s, i) => (
                      <tr key={s.b.minutes}>
                        <th scope="row"><span className="radius-swatch" style={{ background: BAND_COLORS[Math.min(i, 3)] }} aria-hidden="true" /> {s.b.minutes} min</th>
                        <td className="num">{fa(s.a)}</td>
                        <td className="num">{fd(s.reach)}</td>
                        <td className="num">{towns.length ? formatNumber(s.towns.length, 0) : '…'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {top && top.towns.length > 0 && (
                  <div className="radius-places">
                    <p className="radius-places-head">{`Largest towns within ${top.b.minutes} minutes`}</p>
                    <ol>
                      {top.towns.slice(0, 10).map((t) => {
                        const band = stats.find((s) => s.towns.includes(t));
                        return (
                          <li key={t.label + t.lat}>
                            <span>{t.label}</span>
                            <span>{band ? `≤ ${band.b.minutes} min` : ''} · {fd(haversine(place, t))}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
                <p className="calc-note">
                  {bands[0]?.estimated
                    ? 'Estimated areas are circles at typical average speeds and ignore the road network.'
                    : 'Areas follow the road and path network from OpenStreetMap at typical speeds, without live traffic. Rush hour can shrink them noticeably.'}
                </p>
                <div className="calc-actions">
                  <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>Choose a starting point to map how far you can travel.</p></div>
          )}
        </div>
      </div>
      <div className="calc-visual">
        <div className="calc-stage">
          <div className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <DriveTimeMapView center={place} bands={bands} imperial={unit === 'mi'} picking={picking} onMove={(p: LatLon) => { setPicking(false); setPlace({ ...p, name: formatCoord(p) }); }} />
            </Suspense>
          </div>
          {picking && (
            <div className="calc-picking" role="status">
              <span>Click to set the start</span>
              <button type="button" onClick={() => setPicking(false)}>Cancel</button>
            </div>
          )}
        </div>
        <p className="calc-hint">Darker shading is reachable sooner. Drag the center point to try another start.</p>
      </div>
    </div>
  );
}
