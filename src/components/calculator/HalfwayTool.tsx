import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import { formatCoord, formatDuration, formatNumber, geodesic, haversine, intermediate, compass, sphericalBearing } from '../../lib/geo';
import Globe from './Globe';
import PlaceInput from './PlaceInput';
import type { Town } from './places';
import { loadTowns } from './places';
import type { Profile, Route } from './routing';
import { getRoute, PROFILE_LABEL } from './routing';
import { alongLine, centroid } from './halfway';
import type { HalfwayMark } from './HalfwayMapView';

const HalfwayMapView = lazy(() => import('./HalfwayMapView'));

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MAX = 6;
type Unit = 'mi' | 'km';
const M_PER: Record<Unit, number> = { mi: 1609.344, km: 1000 };

const EXAMPLES: [Place, Place][] = [
  [{ name: 'New York, NY', lat: 40.7128, lon: -74.006 }, { name: 'Boston, MA', lat: 42.3601, lon: -71.0589 }],
  [{ name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 }, { name: 'San Francisco, CA', lat: 37.7749, lon: -122.4194 }],
  [{ name: 'Chicago, IL', lat: 41.85, lon: -87.65 }, { name: 'Detroit, MI', lat: 42.3314, lon: -83.0458 }],
  [{ name: 'Dallas, TX', lat: 32.7831, lon: -96.8067 }, { name: 'Houston, TX', lat: 29.7633, lon: -95.3633 }],
  [{ name: 'Seattle, WA', lat: 47.6062, lon: -122.3321 }, { name: 'Portland, OR', lat: 45.5234, lon: -122.6762 }],
  [{ name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, { name: 'Manchester, United Kingdom', lat: 53.4809, lon: -2.2374 }],
];

type RouteState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; route: Route } | { status: 'none' } | { status: 'error' };

function nearTowns(p: LatLon, towns: Town[], refs: LatLon[], limit = 5) {
  const out: { t: Town; d: number; from: number[] }[] = [];
  for (const t of towns) {
    if (Math.abs(t.lat - p.lat) > 0.8) continue;
    const d = haversine(p, t);
    if (d < 80_000) out.push({ t, d, from: [] });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, limit).map((x) => ({ ...x, from: refs.map((r) => haversine(r, x.t)) }));
}

export default function HalfwayTool() {
  const [places, setPlaces] = useState<(Place | null)[]>(EXAMPLES[0]);
  const [unit, setUnit] = useState<Unit>('mi');
  const [profile, setProfile] = useState<Profile>('car');
  const [route, setRoute] = useState<RouteState>({ status: 'idle' });
  const [towns, setTowns] = useState<Town[]>([]);
  const [view, setView] = useState<'map' | 'globe'>('map');
  const [picking, setPicking] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadTowns().then(setTowns);
    const q = new URLSearchParams(window.location.search);
    const ps = q.getAll('p').map((raw) => {
      const [lat, lon, ...name] = raw.split(',');
      const p = { lat: Number(lat), lon: Number(lon) };
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
      return { ...p, name: name.join(',').slice(0, 120) || formatCoord(p) };
    });
    const valid = ps.filter((p): p is Place => p !== null).slice(0, MAX);
    if (valid.length >= 2) setPlaces(valid);
    const u = q.get('unit');
    if (u === 'km' || u === 'mi') setUnit(u);
    const by = q.get('by');
    if (by === 'bike' || by === 'foot' || by === 'car') setProfile(by);
  }, []);

  const set = places.filter((p): p is Place => p !== null);
  const two = places.length === 2 && set.length === 2;
  const A = places[0];
  const B = places[1];

  useEffect(() => {
    if (!touched) return;
    const q = new URLSearchParams();
    set.forEach((p) => q.append('p', `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.name}`));
    if (unit !== 'mi') q.set('unit', unit);
    if (profile !== 'car') q.set('by', profile);
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [places, unit, profile, touched]);

  useEffect(() => {
    if (!two || !A || !B) {
      setRoute({ status: 'idle' });
      return;
    }
    let live = true;
    setRoute({ status: 'loading' });
    getRoute(profile, A, B)
      .then((r) => live && setRoute(r ? { status: 'ok', route: r } : { status: 'none' }))
      .catch(() => live && setRoute({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [two, A?.lat, A?.lon, B?.lat, B?.lon, profile]);

  const straight = two && A && B ? geodesic(A, B).distance : 0;
  const lineMid: LatLon | null = two && A && B ? intermediate(A, B, 0.5) : set.length >= 2 ? centroid(set) : null;
  const ok = route.status === 'ok' ? route.route : null;
  const roadMid = ok ? alongLine(ok.line, 0.5) : null;
  const timeMid = ok ? alongLine(ok.line, 0.5, ok.segDurations) : null;
  const timeSame = !!(roadMid && timeMid && haversine(roadMid, timeMid) < 1500);

  const u = M_PER[unit];
  const fmt = (m: number) => `${formatNumber(m / u, m / u >= 100 ? 0 : 1)} ${unit}`;

  const meet = useMemo(() => {
    const p = timeMid ?? roadMid ?? lineMid;
    if (!p || !towns.length) return [];
    return nearTowns(p, towns, set.slice(0, 2));
  }, [towns, timeMid?.lat, roadMid?.lat, lineMid?.lat, lineMid?.lon, set.length]);

  const spread = !two && lineMid ? set.map((p) => ({ p, d: haversine(p, lineMid), b: sphericalBearing(lineMid, p) })) : [];

  function update(i: number, p: Place | null) {
    setTouched(true);
    setPlaces((ps) => ps.map((x, j) => (j === i ? p : x)));
  }
  function pickAt(i: number, p: LatLon) {
    setPicking(null);
    update(i, { ...p, name: formatCoord(p) });
  }
  function add() {
    setTouched(true);
    setPlaces((ps) => (ps.length >= MAX ? ps : [...ps, null]));
  }
  function remove(i: number) {
    setTouched(true);
    setPlaces((ps) => (ps.length <= 2 ? ps : ps.filter((_, j) => j !== i)));
  }

  async function copyLink() {
    const q = new URLSearchParams();
    set.forEach((p) => q.append('p', `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.name}`));
    if (unit !== 'mi') q.set('unit', unit);
    if (profile !== 'car') q.set('by', profile);
    const link = `${window.location.origin}${window.location.pathname}?${q.toString()}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  const marks: HalfwayMark[] = [];
  if (lineMid) marks.push({ ...lineMid, glyph: '½', label: two ? 'Straight line midpoint' : 'Geographic midpoint', tone: 'line' });
  if (roadMid) marks.push({ ...roadMid, glyph: '½', label: timeSame ? `Halfway by ${profile === 'car' ? 'road' : 'route'}` : 'Halfway by distance', tone: 'road' });
  if (timeMid && !timeSame) marks.push({ ...timeMid, glyph: '⏱', label: 'Halfway by time', tone: 'time' });

  const mapPlaces = useMemo(
    () => places.map((p, i) => (p ? { ...p, letter: LETTERS[i], label: p.name.split(',')[0] } : null)).filter((p): p is NonNullable<typeof p> => p !== null),
    [places],
  );
  const gmaps = (p: LatLon) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

  return (
    <div className="calc calc-halfway" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Halfway point calculator">
          {places.map((p, i) => (
            <div key={`${i}-${places.length}`} className="halfway-place">
              <PlaceInput
                letter={LETTERS[i]}
                label={i === 0 ? 'First place' : i === 1 && places.length === 2 ? 'Second place' : `Place ${LETTERS[i]}`}
                placeholder="Address, city, ZIP code or coordinates"
                value={p}
                onChange={(v) => update(i, v)}
                onPickOnMap={() => {
                  setView('map');
                  setPicking(i);
                }}
              />
              {places.length > 2 && (
                <button type="button" className="halfway-remove" onClick={() => remove(i)} aria-label={`Remove place ${LETTERS[i]}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="air-row-actions">
            <button type="button" onClick={add} disabled={places.length >= MAX}>+ Add another place</button>
            {places.length === 2 && (
              <div className="calc-units" role="radiogroup" aria-label="Travel by">
                {(['car', 'bike', 'foot'] as Profile[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={profile === k} onClick={() => { setTouched(true); setProfile(k); }}>
                    {PROFILE_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {lineMid && set.length >= 2 ? (
            <>
              <div className="calc-summary">
                <div className="calc-head">
                  <p className="calc-route">
                    {two ? `Halfway between ${A!.name.split(',')[0]} and ${B!.name.split(',')[0]}` : `Middle of ${set.length} places`}
                  </p>
                  <div className="calc-units" role="radiogroup" aria-label="Units">
                    {(['mi', 'km'] as Unit[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => { setTouched(true); setUnit(k); }}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="halfway-headline">
                  {meet[0] ? (
                    <>
                      <span className="halfway-near">Near</span> {meet[0].t.label}
                    </>
                  ) : (
                    formatCoord(timeMid ?? roadMid ?? lineMid, 3)
                  )}
                </p>
                {two && (
                  <p className="calc-also">
                    {ok ? (
                      <>
                        <strong>{formatDuration(ok.duration / 3600 / 2)} {profile === 'car' ? 'drive' : profile === 'bike' ? 'ride' : 'walk'} each · </strong>
                        {fmt(ok.distance / 2)} each by {profile === 'car' ? 'road' : 'route'} · {fmt(straight / 2)} each in a straight line
                      </>
                    ) : (
                      <>{fmt(straight / 2)} from each place in a straight line{route.status === 'loading' ? ' · finding the route…' : ''}</>
                    )}
                  </p>
                )}
              </div>

              <div className="calc-details">
                <dl className="calc-facts halfway-points">
                  <div>
                    <dt>{two ? 'Straight line midpoint' : 'Geographic midpoint'}</dt>
                    <dd><a href={gmaps(lineMid)} target="_blank" rel="noopener">{formatCoord(lineMid, 4)}</a></dd>
                  </div>
                  {roadMid && (
                    <div>
                      <dt>Halfway by {profile === 'car' ? 'road' : 'route'} distance</dt>
                      <dd><a href={gmaps(roadMid)} target="_blank" rel="noopener">{formatCoord(roadMid, 4)}</a></dd>
                    </div>
                  )}
                  {timeMid && !timeSame && (
                    <div>
                      <dt>Halfway by {profile === 'car' ? 'drive' : 'travel'} time</dt>
                      <dd><a href={gmaps(timeMid)} target="_blank" rel="noopener">{formatCoord(timeMid, 4)}</a></dd>
                    </div>
                  )}
                </dl>
                {two && route.status === 'none' && <p className="calc-note">No {PROFILE_LABEL[profile].toLowerCase()} route was found between these places, so only the straight line midpoint is shown.</p>}
                {two && route.status === 'error' && <p className="calc-note">The route could not be loaded just now. The straight line midpoint is shown instead.</p>}
                {two && ok && !timeSame && timeMid && roadMid && (
                  <p className="calc-note">
                    {`The time halfway point is ${fmt(haversine(roadMid, timeMid))} from the distance halfway point, because one half of the trip runs on faster roads.`}
                  </p>
                )}

                {spread.length > 0 && (
                  <table className="air-legs">
                    <caption>Straight line distance to the midpoint</caption>
                    <tbody>
                      {spread.map(({ p, d, b }, i) => (
                        <tr key={i}>
                          <th scope="row">{LETTERS[places.indexOf(p)]}. {p.name.split(',')[0]}</th>
                          <td className="num">{fmt(d)}</td>
                          <td className="num">{compass(b).abbr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {meet.length > 0 && (
                  <div className="radius-places">
                    <p className="radius-places-head">Towns near the {two && ok ? `${profile === 'car' ? 'drive' : 'trip'} halfway point` : 'midpoint'}</p>
                    <ol>
                      {meet.map(({ t, d, from }) => (
                        <li key={t.label + t.lat}>
                          <span>{t.label}</span>
                          <span>
                            {two ? `${fmt(from[0])} / ${fmt(from[1])}` : `${fmt(d)} away`}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {two && <p className="calc-note">Straight line distance from {LETTERS[0]} / from {LETTERS[1]}. Towns of 5,000+ people in the US, UK, Canada and Australia, 25,000+ elsewhere.</p>}
                  </div>
                )}

                <div className="calc-actions">
                  <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>Enter at least two places to find the point halfway between them.</p></div>
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
              a={set[0] ?? null}
              b={two ? set[1] : lineMid}
              labelA={set[0]?.name.split(',')[0]}
              labelB={two ? set[1]?.name.split(',')[0] : 'Midpoint'}
              picking={null}
              onPick={() => undefined}
              circles={lineMid ? [{ id: 'mid', center: lineMid, radius: 1, color: '#c4157a', selected: true, label: '½' }] : []}
              cardActions={[
                { label: `Set as ${LETTERS[0]}`, run: (p, name) => update(0, { ...p, name: name ?? formatCoord(p) }) },
                { label: `Set as ${LETTERS[1]}`, run: (p, name) => update(1, { ...p, name: name ?? formatCoord(p) }) },
              ]}
            />
          </div>
          <div hidden={view !== 'map'} className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <HalfwayMapView
                places={mapPlaces}
                hub={lineMid}
                marks={marks}
                roadLine={ok?.line ?? null}
                imperial={unit === 'mi'}
                picking={picking}
                visible={view === 'map'}
                onPick={(i, p) => pickAt(i, p)}
              />
            </Suspense>
          </div>
          {picking !== null && (
            <div className="calc-picking" role="status">
              <span>Click to place {LETTERS[picking]}</span>
              <button type="button" onClick={() => setPicking(null)}>Cancel</button>
            </div>
          )}
        </div>
        <p className="calc-hint">The dashed lines meet at the straight line midpoint. The dark line is the {PROFILE_LABEL[profile].toLowerCase()} route, with its halfway point marked. Drag any lettered pin to move it.</p>
      </div>

      <div className="calc-examples">
        <span id="examples-label-half">Try</span>
        <ul aria-labelledby="examples-label-half">
          {EXAMPLES.map(([a, b]) => (
            <li key={a.name + b.name}>
              <button type="button" onClick={() => { setTouched(true); setPlaces([a, b]); }}>
                {a.name.split(',')[0]} and {b.name.split(',')[0]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
