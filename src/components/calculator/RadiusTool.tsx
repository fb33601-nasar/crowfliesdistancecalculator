import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon, Place, RadiusUnit } from '../../lib/geo';
import {
  capArea,
  capCircumference,
  formatCoord,
  formatNumber,
  haversine,
  METRES_PER_SQ_MILE,
  RADIUS_UNIT,
} from '../../lib/geo';
import Globe from './Globe';
import type { GlobeCircle } from './Globe';
import PlaceInput from './PlaceInput';
import type { Town } from './places';
import { loadTowns, nameForPoint } from './places';
import type { RadiusMapHandle } from './RadiusMapView';

const RadiusMapView = lazy(() => import('./RadiusMapView'));

interface Circle {
  id: string;
  center: Place;
  /** metres */
  radius: number;
  color: number;
}

const COLORS = ['#c4157a', '#2f5bd3', '#0f8a6c', '#d9822b', '#7a3fc4'];
const MAX_CIRCLES = 5;
const UNITS: RadiusUnit[] = ['mi', 'km', 'm', 'ft', 'nmi'];
const PRESETS: Record<RadiusUnit, number[]> = {
  mi: [1, 5, 10, 25, 50, 100],
  km: [1, 5, 10, 25, 50, 100],
  m: [100, 250, 500, 1000, 2000],
  ft: [500, 1000, 2640, 5280],
  nmi: [5, 10, 50, 150],
};

const EXAMPLES: { name: string; center: Place; radius: number; unit: RadiusUnit }[] = [
  { name: '25 miles around Chicago', center: { name: 'Chicago, IL', lat: 41.85, lon: -87.65 }, radius: 25, unit: 'mi' },
  { name: '10 miles around Dallas', center: { name: 'Dallas, TX', lat: 32.7831, lon: -96.8067 }, radius: 10, unit: 'mi' },
  { name: '50 miles around Los Angeles', center: { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 }, radius: 50, unit: 'mi' },
  { name: '150 air miles around Atlanta', center: { name: 'Atlanta, GA', lat: 33.749, lon: -84.388 }, radius: 150, unit: 'nmi' },
  { name: '10 km around London', center: { name: 'London, United Kingdom', lat: 51.5085, lon: -0.1257 }, radius: 10, unit: 'km' },
  { name: '100 miles around Manchester', center: { name: 'Manchester, United Kingdom', lat: 53.4809, lon: -2.2374 }, radius: 100, unit: 'mi' },
];

let idSeq = 0;
const newId = () => `c${++idSeq}`;
const short = (name: string) => name.split(',')[0];

function fmtRadius(metres: number, unit: RadiusUnit): string {
  const v = metres / RADIUS_UNIT[unit].metres;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${formatNumber(Number(v.toFixed(digits)), v % 1 === 0 ? 0 : digits)} ${RADIUS_UNIT[unit].short}`;
}

function encode(c: Circle): string {
  return `${c.center.lat.toFixed(5)},${c.center.lon.toFixed(5)},${Math.round(c.radius)},${c.color},${c.center.name}`;
}
function decode(raw: string): Circle | null {
  const [lat, lon, r, col, ...rest] = raw.split(',');
  const p = { lat: Number(lat), lon: Number(lon) };
  const radius = Number(r);
  if (![p.lat, p.lon, radius].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180 || radius <= 0) return null;
  return {
    id: newId(),
    center: { ...p, name: rest.join(',').trim().slice(0, 120) || formatCoord(p) },
    radius: Math.min(radius, 10_000_000),
    color: Math.abs(Number(col) || 0) % COLORS.length,
  };
}

export default function RadiusTool() {
  const first = EXAMPLES[0];
  const [circles, setCircles] = useState<Circle[]>(() => [
    { id: newId(), center: first.center, radius: first.radius * RADIUS_UNIT[first.unit].metres, color: 0 },
  ]);
  const [selectedId, setSelectedId] = useState(circles[0].id);
  const [unit, setUnit] = useState<RadiusUnit>('mi');
  const [radiusText, setRadiusText] = useState(String(first.radius));
  const [view, setView] = useState<'globe' | 'map'>('map');
  const [mapWanted, setMapWanted] = useState(true);
  const [picking, setPicking] = useState<null | 'center' | 'add' | 'probe'>(null);
  const [probe, setProbe] = useState<Place | null>(null);
  const [cities, setCities] = useState<Town[]>([]);
  const [copied, setCopied] = useState('');
  const touched = useRef(false);
  const mapRef = useRef<RadiusMapHandle>(null);

  const selected = circles.find((c) => c.id === selectedId) ?? circles[0];

  // Shared links restore every circle.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const restored = q.getAll('c').map(decode).filter((c): c is Circle => c !== null).slice(0, MAX_CIRCLES);
    const u = q.get('unit') as RadiusUnit | null;
    const useUnit = u && u in RADIUS_UNIT ? u : unit;
    if (u && u in RADIUS_UNIT) setUnit(u);
    if (restored.length) {
      setCircles(restored);
      setSelectedId(restored[0].id);
      setRadiusText(trimNum(restored[0].radius / RADIUS_UNIT[useUnit].metres));
    }
    loadTowns().then(setCities).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!touched.current) return;
    window.history.replaceState(null, '', `?${shareQuery()}`);
  }, [circles, unit]);

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

  function shareQuery() {
    const q = new URLSearchParams();
    for (const c of circles) q.append('c', encode(c));
    if (unit !== 'mi') q.set('unit', unit);
    return q.toString();
  }

  function trimNum(v: number) {
    return String(Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)));
  }

  function update(id: string, patch: Partial<Circle>) {
    touched.current = true;
    setCircles((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function setCenter(place: Place | null) {
    if (!place) return;
    update(selected.id, { center: place });
  }

  function setRadiusValue(text: string) {
    setRadiusText(text);
    const v = Number(text.replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) update(selected.id, { radius: Math.min(v * RADIUS_UNIT[unit].metres, 10_000_000) });
  }

  function chooseUnit(u: RadiusUnit) {
    touched.current = true;
    setUnit(u);
    setRadiusText(trimNum(selected.radius / RADIUS_UNIT[u].metres));
  }

  function select(id: string) {
    const c = circles.find((x) => x.id === id);
    if (!c) return;
    setSelectedId(id);
    setRadiusText(trimNum(c.radius / RADIUS_UNIT[unit].metres));
  }

  function named(point: LatLon, known?: string): Place {
    return { ...point, name: known ?? formatCoord(point) };
  }

  function nameLater(id: string, point: LatLon) {
    void nameForPoint(point.lat, point.lon).then((name) => {
      if (!name) return;
      setCircles((cs) =>
        cs.map((c) => (c.id === id && c.center.lat === point.lat && c.center.lon === point.lon ? { ...c, center: { ...c.center, name } } : c)),
      );
    });
  }

  function addCircleAt(point: LatLon, known?: string) {
    if (circles.length >= MAX_CIRCLES) return;
    touched.current = true;
    const used = new Set(circles.map((c) => c.color));
    const color = [0, 1, 2, 3, 4].find((i) => !used.has(i)) ?? circles.length % COLORS.length;
    const c: Circle = { id: newId(), center: named(point, known), radius: selected.radius, color };
    setCircles((cs) => [...cs, c]);
    setSelectedId(c.id);
    if (!known) nameLater(c.id, point);
  }

  function onMapPick(point: LatLon, known?: string) {
    const mode = picking;
    setPicking(null);
    if (mode === 'add') return addCircleAt(point, known);
    if (mode === 'probe') {
      setProbe(named(point, known));
      if (!known) void nameForPoint(point.lat, point.lon).then((name) => name && setProbe((p) => (p && p.lat === point.lat && p.lon === point.lon ? { ...p, name } : p)));
      return;
    }
    update(selected.id, { center: named(point, known) });
    if (!known) nameLater(selected.id, point);
  }

  function removeCircle(id: string) {
    if (circles.length === 1) return;
    touched.current = true;
    const rest = circles.filter((c) => c.id !== id);
    setCircles(rest);
    if (id === selectedId) select(rest[0].id);
  }

  async function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?${shareQuery()}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied('link');
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  function download() {
    const go = () => {
      const url = mapRef.current?.snapshot();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${short(selected.center.name).replace(/[^\w-]+/g, '-').toLowerCase()}-${fmtRadius(selected.radius, unit).replace(/\s+/g, '')}-radius-map.png`;
      a.click();
    };
    if (view !== 'map') {
      setMapWanted(true);
      setView('map');
      setTimeout(go, 1500);
    } else go();
  }

  const area = capArea(selected.radius);
  const circumference = capCircumference(selected.radius);
  const imperial = unit === 'mi' || unit === 'ft' || unit === 'nmi';

  const inside = useMemo(() => {
    if (!cities.length) return null;
    const hits = cities
      .map((c) => ({ c, d: haversine(selected.center, c) }))
      .filter((h) => h.d <= selected.radius)
      .sort((x, y) => x.d - y.d);
    return { total: hits.length, list: hits.slice(0, 10) };
  }, [cities, selected.center.lat, selected.center.lon, selected.radius]);

  const probeDist = probe ? haversine(selected.center, probe) : null;
  const probeInside = probeDist !== null && probeDist <= selected.radius;

  const mapCircles = circles.map((c) => ({
    id: c.id,
    center: c.center,
    radius: c.radius,
    color: COLORS[c.color],
    selected: c.id === selected.id,
    label: `${fmtRadius(c.radius, unit)} radius`,
  }));
  const globeCircles: GlobeCircle[] = mapCircles.map((c) => ({ ...c, label: short(circles.find((x) => x.id === c.id)!.center.name) }));

  return (
    <div className="calc calc-radius" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Radius map tool">
          <PlaceInput
            letter="●"
            label={circles.length > 1 ? `Center of circle ${circles.indexOf(selected) + 1}` : 'Center'}
            pickLabel="Pick the center on the map"
            placeholder="Address, city, ZIP code or coordinates"
            value={selected.center}
            onChange={setCenter}
            onPickOnMap={() => setPicking('center')}
          />
          <div className="radius-row">
            <label htmlFor="radius-value">Radius</label>
            <div className="radius-inputs">
              <input
                id="radius-value"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={radiusText}
                onChange={(e) => setRadiusValue(e.target.value)}
                aria-describedby="radius-unit"
              />
              <select id="radius-unit" value={unit} onChange={(e) => chooseUnit(e.target.value as RadiusUnit)} aria-label="Radius unit">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {RADIUS_UNIT[u].long}
                  </option>
                ))}
              </select>
            </div>
            <div className="radius-presets" role="group" aria-label="Common radii">
              {PRESETS[unit].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={Math.abs(selected.radius - v * RADIUS_UNIT[unit].metres) < 1}
                  onClick={() => setRadiusValue(String(v))}
                >
                  {formatNumber(v, 0)} {RADIUS_UNIT[unit].short}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          <div className="calc-summary">
            <p className="calc-route">
              Everything within {fmtRadius(selected.radius, unit)} of {short(selected.center.name)}
            </p>
            <dl className="radius-stats">
              <div>
                <dt>Area</dt>
                <dd>
                  {formatNumber(area / METRES_PER_SQ_MILE, area / METRES_PER_SQ_MILE < 10 ? 2 : 0)} sq mi
                  <small>{formatNumber(area / 1e6, area / 1e6 < 10 ? 2 : 0)} km²</small>
                </dd>
              </div>
              <div>
                <dt>Circumference</dt>
                <dd>
                  {fmtRadius(circumference, unit)}
                  <small>around the edge</small>
                </dd>
              </div>
              <div>
                <dt>Diameter</dt>
                <dd>
                  {fmtRadius(selected.radius * 2, unit)}
                  <small>edge to edge</small>
                </dd>
              </div>
            </dl>
          </div>

          <div className="calc-details">
            <div className="radius-circles">
              <div className="radius-circles-head">
                <span>
                  {circles.length} {circles.length === 1 ? 'circle' : 'circles'}
                </span>
                <button
                  type="button"
                  onClick={() => setPicking(picking === 'add' ? null : 'add')}
                  disabled={circles.length >= MAX_CIRCLES}
                  aria-pressed={picking === 'add'}
                >
                  {picking === 'add' ? 'Click the map to place it' : '+ Add a circle'}
                </button>
              </div>
              {circles.length > 1 && (
                <ul>
                  {circles.map((c, i) => (
                    <li key={c.id} className={c.id === selected.id ? 'is-selected' : undefined}>
                      <button type="button" className="radius-circle-pick" onClick={() => select(c.id)} aria-pressed={c.id === selected.id}>
                        <span className="radius-swatch" style={{ background: COLORS[c.color] }} aria-hidden="true" />
                        {i + 1}. {short(c.center.name)} · {fmtRadius(c.radius, unit)}
                      </button>
                      <button type="button" className="radius-circle-remove" onClick={() => removeCircle(c.id)} aria-label={`Remove circle ${i + 1}`}>
                        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                          <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="radius-check">
              <PlaceInput
                letter="?"
                label="Is this place inside the circle?"
                pickLabel="Pick it on the map"
                placeholder="Type a place to check"
                value={probe}
                onChange={setProbe}
                onPickOnMap={() => setPicking('probe')}
              />
              {probe && probeDist !== null && (
                <p className={`radius-verdict ${probeInside ? 'is-in' : 'is-out'}`}>
                  <strong>{probeInside ? 'Inside' : 'Outside'}</strong>{' '}
                  {short(probe.name)} is {fmtRadius(probeDist, unit)} from the center
                  {probeInside
                    ? `, ${fmtRadius(selected.radius - probeDist, unit)} inside the edge.`
                    : `, ${fmtRadius(probeDist - selected.radius, unit)} beyond the edge.`}
                </p>
              )}
            </div>

            {inside && (
              <div className="radius-places">
                <p className="radius-places-head">
                  {inside.total === 0
                    ? 'No towns in our list inside this circle'
                    : `${formatNumber(inside.total, 0)} ${inside.total === 1 ? 'town' : 'towns and cities'} inside, nearest first`}
                </p>
                {inside.list.length > 0 && (
                  <ol>
                    {inside.list.map(({ c, d }) => (
                      <li key={`${c.label}-${c.lat}`}>
                        <span>{c.label}</span>
                        <span>{d < 1000 ? 'center' : fmtRadius(d, unit)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="calc-note">Towns of 5,000+ people in the US, UK, Canada, Australia and NZ, and 25,000+ elsewhere.</p>
              </div>
            )}

            <div className="calc-actions">
              <button type="button" onClick={copyLink}>
                {copied === 'link' ? 'Link copied' : 'Copy link'}
              </button>
              <button type="button" onClick={download}>
                Download image
              </button>
              <button type="button" onClick={() => window.print()}>
                Print
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="calc-visual">
        <div className="calc-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'map'} onClick={() => { setMapWanted(true); setView('map'); }}>
            Street map
          </button>
          <button type="button" role="tab" aria-selected={view === 'globe'} onClick={() => setView('globe')}>
            Globe
          </button>
        </div>
        <div className="calc-stage">
          <div hidden={view !== 'globe'} className="calc-globe">
            <Globe
              a={null}
              b={null}
              circles={globeCircles}
              focus={{ center: selected.center, radius: selected.radius }}
              picking={picking ? 'a' : null}
              onPick={(_w, p, name) => onMapPick(p, name)}
              cardActions={[
                { label: 'Center here', run: (p, name) => onMapPick(p, name) },
                { label: 'Add a circle', run: (p, name) => addCircleAt(p, name) },
              ]}
            />
          </div>
          {mapWanted && (
            <div hidden={view !== 'map'} className="calc-map">
              <Suspense fallback={<p className="map-status">Loading the map…</p>}>
                <RadiusMapView
                  ref={mapRef}
                  circles={mapCircles}
                  probe={probe ? { ...probe, inside: probeInside } : null}
                  imperial={imperial}
                  picking={picking !== null}
                  visible={view === 'map'}
                  onPick={(p) => onMapPick(p)}
                  onMoveCenter={(id, p) => {
                    update(id, { center: named(p) });
                    nameLater(id, p);
                  }}
                  onResize={(id, r) => {
                    update(id, { radius: r });
                    if (id === selected.id) setRadiusText(trimNum(r / RADIUS_UNIT[unit].metres));
                  }}
                  onSelect={select}
                />
              </Suspense>
            </div>
          )}
          {picking && (
            <div className="calc-picking" role="status">
              <span>{picking === 'add' ? 'Click to place the new circle' : picking === 'probe' ? 'Click the place to check' : 'Click to set the center'}</span>
              <button type="button" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <p className="calc-hint">
          {view === 'map'
            ? 'Drag the center to move a circle, drag the white handle on its edge to resize it, click a circle to select it.'
            : 'Drag to turn, scroll or pinch to zoom, click a place to center a circle there.'}
        </p>
      </div>

      <div className="calc-examples">
        <span id="examples-label-radius">Try a radius</span>
        <ul aria-labelledby="examples-label-radius">
          {EXAMPLES.map((ex) => (
            <li key={ex.name}>
              <button
                type="button"
                onClick={() => {
                  touched.current = true;
                  const c: Circle = { id: newId(), center: ex.center, radius: ex.radius * RADIUS_UNIT[ex.unit].metres, color: 0 };
                  setCircles([c]);
                  setSelectedId(c.id);
                  setUnit(ex.unit);
                  setRadiusText(String(ex.radius));
                  setProbe(null);
                }}
              >
                {ex.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
