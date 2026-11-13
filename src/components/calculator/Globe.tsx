import { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoInterpolate, geoContains, geoCircle } from 'd3-geo';
import type { LatLon } from '../../lib/geo';
import { formatCoord, haversine, midpoint, MEAN_EARTH_RADIUS_M } from '../../lib/geo';
import { land } from './land';
import type { Country } from './countries';
import type { CityPoint } from './places';
import { loadCityPoints } from './places';
import type { MultiLineString } from 'geojson';

interface Props {
  a: LatLon | null;
  b: LatLon | null;
  labelA?: string;
  labelB?: string;
  /** e.g. "3,471 mi", shown on the route */
  distanceLabel?: string;
  picking: 'a' | 'b' | null;
  onPick: (which: 'a' | 'b', point: LatLon, name?: string) => void;
  /** connecting points between A and B, drawn as extra legs */
  stops?: LatLon[];
  /** circles to draw, for the radius tool */
  circles?: GlobeCircle[];
  /** a circle to frame when there is no route */
  focus?: { center: LatLon; radius: number } | null;
  /** buttons on the details card; defaults to Set as A / Set as B */
  cardActions?: { label: string; run: (point: LatLon, name?: string) => void }[];
}

export interface GlobeCircle {
  id: string;
  center: LatLon;
  /** metres */
  radius: number;
  color: string;
  selected?: boolean;
  label?: string;
}

interface View {
  rot: [number, number];
  scale: number;
}

interface World {
  countries: Country[];
  borders: MultiLineString;
}

interface Spot extends LatLon {
  /** nearest named city, if one is close */
  city?: CityPoint;
  country?: string;
}

const SIZE = 500;
const BASE = 214;
const MIN_SCALE = BASE * 0.85;
const MAX_SCALE = BASE * 60;
const graticule = geoGraticule10();
const clampLat = (v: number) => Math.max(-89, Math.min(89, v));
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

function autoView(a: LatLon | null, b: LatLon | null, focus?: { center: LatLon; radius: number } | null): View {
  if (focus && !(a && b)) {
    const angle = (2 * focus.radius) / MEAN_EARTH_RADIUS_M;
    const wanted = 150 / Math.max(Math.sin(Math.min(angle, Math.PI) / 2), 0.002);
    return {
      rot: [-focus.center.lon, -focus.center.lat],
      scale: Math.min(Math.max(BASE, wanted), MAX_SCALE),
    };
  }
  const both = a && b;
  const centre = both ? midpoint(a, b) : (a ?? b ?? { lat: 30, lon: -40 });
  const angle = both ? haversine(a, b) / MEAN_EARTH_RADIUS_M : Math.PI / 2;
  const wanted = 92 / Math.max(Math.sin(angle / 2), 0.004);
  return {
    rot: [-centre.lon, -centre.lat],
    scale: Math.min(Math.max(BASE, wanted), MAX_SCALE),
  };
}

/** Rough pixel width of a label in the SVG's own units. */
const textWidth = (s: string) => s.length * 7.4 + 22;

function spotTitle(s: Spot): { title: string; sub: string } {
  const coords = formatCoord(s, 3);
  if (s.city) {
    const place = s.city.admin ? `${s.city.name}, ${s.city.admin}` : s.city.name;
    return { title: place, sub: `${s.city.country} · ${coords}` };
  }
  if (s.country) return { title: s.country, sub: coords };
  return { title: 'Open water', sub: coords };
}

function spotName(s: Spot): string | undefined {
  if (s.city) return s.city.admin ? `${s.city.name}, ${s.city.admin}` : `${s.city.name}, ${s.city.country}`;
  return undefined;
}

/**
 * An interactive globe: turn it, zoom it, read country and city names, hover
 * to see where the pointer is, click for details or to place a point.
 */
export default function Globe({
  a,
  b,
  labelA = '',
  labelB = '',
  distanceLabel,
  picking,
  onPick,
  circles = [],
  stops = [],
  focus = null,
  cardActions,
}: Props) {
  const [view, setView] = useState<View>(() => autoView(a, b, focus));
  const viewRef = useRef(view);
  viewRef.current = view;
  const svgRef = useRef<SVGSVGElement>(null);
  const anim = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; rot: [number, number]; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [world, setWorld] = useState<World | null>(null);
  const [cities, setCities] = useState<CityPoint[]>([]);
  const [hover, setHover] = useState<(Spot & { x: number; y: number }) | null>(null);
  const [selected, setSelected] = useState<Spot | null>(null);

  // Country outlines and the city list load after the first paint.
  useEffect(() => {
    let live = true;
    import('./countries').then((m) => live && setWorld({ countries: m.countries, borders: m.borders }));
    loadCityPoints().then((c) => live && setCities(c));
    return () => {
      live = false;
    };
  }, []);

  function stopAnim() {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
  }

  function animateTo(target: View) {
    stopAnim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = viewRef.current;
    if (reduce) {
      setView(target);
      return;
    }
    const dLon = ((target.rot[0] - from.rot[0] + 540) % 360) - 180;
    const dLat = target.rot[1] - from.rot[1];
    const logFrom = Math.log(from.scale);
    const logTo = Math.log(target.scale);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setView({
        rot: [from.rot[0] + dLon * e, from.rot[1] + dLat * e],
        scale: Math.exp(logFrom + (logTo - logFrom) * e),
      });
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }

  // Turn to face each new route.
  useEffect(() => {
    setSelected(null);
    animateTo(autoView(a, b, focus));
  }, [a?.lat, a?.lon, b?.lat, b?.lon, focus?.center.lat, focus?.center.lon, focus?.radius]);

  useEffect(() => stopAnim, []);

  function zoom(f: number) {
    stopAnim();
    setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f)) }));
  }

  // Wheel and trackpad zoom. Needs a non-passive listener to keep the page still.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoom(Math.exp(-delta * 0.0018));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scene = useMemo(() => {
    const projection = geoOrthographic()
      .rotate(view.rot)
      .scale(view.scale)
      .translate([SIZE / 2, SIZE / 2])
      .clipAngle(90)
      .precision(0.3);
    const path = geoPath(projection).digits(1);
    const centre: [number, number] = [-view.rot[0], -view.rot[1]];
    const facing = (lon: number, lat: number, margin = 0.015) =>
      geoDistance([lon, lat], centre) < Math.PI / 2 - margin;
    const inFrame = (q: [number, number] | null) =>
      q && q[0] > -4 && q[0] < SIZE + 4 && q[1] > -4 && q[1] < SIZE + 4 ? q : null;
    const pin = (p: LatLon | null) => (p && facing(p.lon, p.lat) ? inFrame(projection([p.lon, p.lat])) : null);
    let mid: [number, number] | null = null;
    if (a && b) {
      const m = geoInterpolate([a.lon, a.lat], [b.lon, b.lat])(0.5);
      if (geoDistance(m, centre) < Math.PI / 2 - 0.05) mid = inFrame(projection(m));
    }

    // Labels: biggest countries first, then cities as you zoom in, never overlapping.
    const boxes: [number, number, number, number][] = [];
    const reserve = (x: number, y: number, w: number, h: number) => {
      if (x < 4 || y < 4 || x + w > SIZE - 4 || y + h > SIZE - 4) return false;
      for (const [bx, by, bw, bh] of boxes) {
        if (x < bx + bw && x + w > bx && y < by + bh && y + h > by) return false;
      }
      boxes.push([x, y, w, h]);
      return true;
    };
    // keep labels clear of the route pins
    for (const p of [pin(a), pin(b)]) if (p) boxes.push([p[0] - 22, p[1] - 22, 44, 44]);

    const countryLabels: { x: number; y: number; name: string; big: boolean }[] = [];
    const cityLabels: { x: number; y: number; name: string; capital: boolean }[] = [];
    const zoomLevel = view.scale / BASE;

    const placeCountries = () => {
      if (!world) return;
      for (const c of world.countries) {
        const px = c.area * view.scale * view.scale;
        if (px < 1100 || !facing(c.at[0], c.at[1], 0.12)) continue;
        const p = projection(c.at);
        if (!p) continue;
        const big = px > 9000;
        const w = c.name.length * (big ? 6.6 : 5.9) + 4;
        const h = big ? 14 : 12;
        if (reserve(p[0] - w / 2, p[1] - h / 2, w, h)) countryLabels.push({ x: p[0], y: p[1], name: c.name, big });
      }
    };
    const placeCities = () => {
      if (zoomLevel < 1.5 || cities.length === 0) return;
      const limit = Math.min(70, Math.round(4 * Math.pow(zoomLevel, 1.25)));
      for (let i = 0; i < cities.length && cityLabels.length < limit; i++) {
        const c = cities[i];
        if (!facing(c.lon, c.lat, 0.05)) continue;
        const p = projection([c.lon, c.lat]);
        if (!p) continue;
        const w = c.name.length * 6.3 + 12;
        if (reserve(p[0] - 4, p[1] - 8, w, 16)) cityLabels.push({ x: p[0], y: p[1], name: c.name, capital: i < 40 });
      }
    };
    if (zoomLevel > 3) {
      placeCities();
      placeCountries();
    } else {
      placeCountries();
      placeCities();
    }

    const circlePaths = circles.map((c) => ({
      ...c,
      d:
        path(
          geoCircle()
            .center([c.center.lon, c.center.lat])
            .radius((c.radius / MEAN_EARTH_RADIUS_M) * (180 / Math.PI))
            .precision(1.5)(),
        ) ?? '',
      dot: facing(c.center.lon, c.center.lat) ? inFrame(projection([c.center.lon, c.center.lat])) : null,
    }));

    return {
      circlePaths,
      projection,
      facing,
      sphere: path({ type: 'Sphere' }) ?? '',
      grid: path(graticule) ?? '',
      land: world ? '' : (path(land) ?? ''),
      countries: world ? world.countries.map((c) => ({ name: c.name, d: path(c.feature) ?? '' })) : [],
      borders: world ? (path(world.borders) ?? '') : '',
      arc:
        a && b
          ? (path({ type: 'LineString', coordinates: [[a.lon, a.lat], ...stops.map((s) => [s.lon, s.lat]), [b.lon, b.lat]] }) ?? '')
          : '',
      stopPins: stops.map((s) => pin(s)),
      pa: pin(a),
      pb: pin(b),
      mid,
      countryLabels,
      cityLabels,
    };
  }, [view, world, cities, a?.lat, a?.lon, b?.lat, b?.lon, circles, stops]);

  /** What lies under a point on the globe: the country, and a city if one is close by. */
  function lookup(lat: number, lon: number): Spot {
    const spot: Spot = { lat, lon };
    if (world) {
      for (const c of world.countries) {
        const [[w, s], [e, n]] = c.bounds;
        if (lat < s - 0.5 || lat > n + 0.5) continue;
        if (w <= e && (lon < w - 0.5 || lon > e + 0.5)) continue;
        if (geoContains(c.feature, [lon, lat])) {
          spot.country = c.name;
          break;
        }
      }
    }
    const reach = 26 / viewRef.current.scale; // radians, about 26 pixels on screen
    let best = reach;
    for (const c of cities) {
      if (Math.abs(c.lat - lat) > (best * 180) / Math.PI + 0.01) continue;
      const d = geoDistance([lon, lat], [c.lon, c.lat]);
      if (d < best) {
        best = d;
        spot.city = c;
      }
    }
    if (spot.city && !spot.country) spot.country = spot.city.country;
    return spot;
  }

  function toSvg(e: { clientX: number; clientY: number }) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
      k: SIZE / rect.width,
    };
  }

  function pointAt(x: number, y: number): LatLon | null {
    if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > viewRef.current.scale) return null;
    const ll = scene.projection.invert?.([x, y]);
    return ll ? { lat: ll[1], lon: wrap(ll[0]) } : null;
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopAnim();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale: viewRef.current.scale };
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, rot: viewRef.current.rot, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (pinch.current.scale * dist) / pinch.current.dist));
      setView((v) => ({ ...v, scale: s }));
      return;
    }

    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) {
        setDragging(true);
        setHover(null);
      }
      d.moved = true;
      const { k } = toSvg(e);
      const degPerUnit = 180 / (Math.PI * viewRef.current.scale);
      setView((v) => ({
        ...v,
        rot: [d.rot[0] + dx * k * degPerUnit, clampLat(d.rot[1] - dy * k * degPerUnit)],
      }));
      return;
    }

    // Plain hover with a mouse: show what is under the pointer.
    if (e.pointerType !== 'mouse') return;
    const { x, y } = toSvg(e);
    if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const ll = pointAt(x, y);
      setHover(ll ? { ...lookup(ll.lat, ll.lon), x, y } : null);
    });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved) return;
    const { x, y } = toSvg(e);
    const ll = pointAt(x, y);
    if (!ll) {
      setSelected(null);
      return;
    }
    const spot = lookup(ll.lat, ll.lon);
    if (picking) {
      const at = spot.city ? { lat: spot.city.lat, lon: spot.city.lon } : ll;
      onPick(picking, at, spotName(spot));
    } else {
      setSelected(spot);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const step = 900 / viewRef.current.scale;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [x, y] = moves[e.key];
      setView((v) => ({ ...v, rot: [v.rot[0] + x, clampLat(v.rot[1] + y)] }));
    } else if (e.key === '+' || e.key === '=') zoom(1.4);
    else if (e.key === '-') zoom(1 / 1.4);
    else if (e.key === 'Escape') setSelected(null);
  }

  function chooseSpot(which: 'a' | 'b') {
    if (!selected) return;
    const at = selected.city
      ? { lat: selected.city.lat, lon: selected.city.lon }
      : { lat: selected.lat, lon: selected.lon };
    onPick(which, at, spotName(selected));
    setSelected(null);
  }

  const description =
    a && b
      ? `Globe showing the straight line path from ${labelA} to ${labelB}${distanceLabel ? `, ${distanceLabel}` : ''}. Drag to turn it, scroll or pinch to zoom, click a place for details.`
      : 'Globe. Enter two places to draw the straight line path between them.';
  const arcKey = `${a?.lat},${a?.lon},${b?.lat},${b?.lon}`;
  const leftFirst = scene.pa && scene.pb ? scene.pa[0] <= scene.pb[0] : true;

  const selPoint =
    selected && scene.facing(selected.lon, selected.lat) ? scene.projection([selected.lon, selected.lat]) : null;
  const pct = (v: number) => `${((v / SIZE) * 100).toFixed(2)}%`;
  const hoverInfo = hover && !dragging ? spotTitle(hover) : null;
  const selInfo = selected ? spotTitle(selected) : null;

  return (
    <div className="globe-box">
      <svg
        ref={svgRef}
        className={`globe${dragging ? ' is-dragging' : ''}${picking ? ' is-picking' : ''}`}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={description}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => zoom(1.8)}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id="globe-shade" cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.32" />
          </radialGradient>
          <radialGradient id="globe-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0.86" stopColor="#ff5fb4" stopOpacity="0" />
            <stop offset="0.93" stopColor="#7f86ff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#7f86ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {view.scale < SIZE && <circle cx={SIZE / 2} cy={SIZE / 2} r={view.scale * 1.12} fill="url(#globe-halo)" />}
        <path d={scene.sphere} className="globe-sea" />
        <path d={scene.grid} className="globe-grid" />
        {scene.land && <path d={scene.land} className="globe-land" />}
        {scene.countries.map((c, i) => (
          <path
            key={`${c.name}-${i}`}
            d={c.d}
            className={
              hover?.country === c.name || selected?.country === c.name ? 'globe-country is-hot' : 'globe-country'
            }
          />
        ))}
        {scene.borders && <path d={scene.borders} className="globe-borders" />}
        <path d={scene.sphere} fill="url(#globe-shade)" pointerEvents="none" />
        {scene.circlePaths.map((c) => (
          <path
            key={c.id}
            d={c.d}
            fill={c.color}
            fillOpacity={c.selected ? 0.26 : 0.16}
            stroke={c.color}
            strokeWidth={c.selected ? 2.6 : 1.6}
            pointerEvents="none"
          />
        ))}

        <g pointerEvents="none">
          {scene.countryLabels.map((l) => (
            <text
              key={l.name}
              x={l.x}
              y={l.y}
              dy="0.35em"
              textAnchor="middle"
              className={l.big ? 'globe-country-label is-big' : 'globe-country-label'}
            >
              {l.name}
            </text>
          ))}
          {scene.cityLabels.map((l) => (
            <g key={`${l.name}-${l.x.toFixed(0)}`} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
              <circle r={l.capital ? 2.8 : 2.2} className="globe-city-dot" />
              <text x="6" dy="0.35em" className="globe-city-label">
                {l.name}
              </text>
            </g>
          ))}
        </g>

        {scene.arc && (
          <g pointerEvents="none">
            <path d={scene.arc} className="globe-arc-glow" />
            <path key={arcKey} d={scene.arc} className="globe-arc" pathLength={1} />
          </g>
        )}
        {selPoint && (
          <g transform={`translate(${selPoint[0].toFixed(1)} ${selPoint[1].toFixed(1)})`} pointerEvents="none">
            <circle r="10" className="globe-sel-ring" />
            <circle r="4" className="globe-sel-dot" />
          </g>
        )}
        {scene.circlePaths.map(
          (c) =>
            c.dot && (
              <g key={`dot-${c.id}`} transform={`translate(${c.dot[0].toFixed(1)} ${c.dot[1].toFixed(1)})`} pointerEvents="none">
                <circle r="7" fill="#fff" stroke={c.color} strokeWidth="3.5" />
                {c.label && c.selected && (
                  <text y="-14" textAnchor="middle" className="globe-city-label">
                    {c.label}
                  </text>
                )}
              </g>
            ),
        )}
        {scene.stopPins.map(
          (p, k) =>
            p && (
              <g key={`stop-${k}`} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`} pointerEvents="none">
                <circle r="6" fill="#fff" stroke="#c4157a" strokeWidth="3" />
              </g>
            ),
        )}
        {scene.pa && <Pin x={scene.pa[0]} y={scene.pa[1]} letter="A" />}
        {scene.pb && <Pin x={scene.pb[0]} y={scene.pb[1]} letter="B" />}
        {scene.pa && labelA && <Tag x={scene.pa[0]} y={scene.pa[1]} text={labelA} align={leftFirst ? 'left' : 'right'} />}
        {scene.pb && labelB && <Tag x={scene.pb[0]} y={scene.pb[1]} text={labelB} align={leftFirst ? 'right' : 'left'} />}
        {scene.mid && distanceLabel && (
          <Tag x={scene.mid[0]} y={scene.mid[1] - 18} text={distanceLabel} tone="course" align="center" />
        )}
      </svg>

      {hoverInfo && hover && !selected && (
        <div
          className="globe-tip"
          style={{ left: pct(hover.x), top: pct(hover.y) }}
          data-flip={hover.x > SIZE * 0.62 ? 'left' : 'right'}
          aria-hidden="true"
        >
          <strong>{hoverInfo.title}</strong>
          <span>{hoverInfo.sub}</span>
        </div>
      )}

      {selected && selInfo && selPoint && (
        <div
          className="globe-card"
          style={{ left: pct(selPoint[0]), top: pct(selPoint[1]) }}
          data-flip={selPoint[1] < SIZE * 0.38 ? 'down' : 'up'}
          role="dialog"
          aria-label={`${selInfo.title} details`}
        >
          <button type="button" className="globe-card-close" onClick={() => setSelected(null)} aria-label="Close">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <strong>{selInfo.title}</strong>
          <span>{selInfo.sub}</span>
          <div className="globe-card-actions">
            {cardActions ? (
              cardActions.map((act) => (
                <button
                  key={act.label}
                  type="button"
                  onClick={() => {
                    const at = selected.city
                      ? { lat: selected.city.lat, lon: selected.city.lon }
                      : { lat: selected.lat, lon: selected.lon };
                    act.run(at, spotName(selected));
                    setSelected(null);
                  }}
                >
                  {act.label}
                </button>
              ))
            ) : (
              <>
                <button type="button" onClick={() => chooseSpot('a')}>
                  Set as A
                </button>
                <button type="button" onClick={() => chooseSpot('b')}>
                  Set as B
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="globe-tools">
        <button type="button" onClick={() => zoom(1.5)} aria-label="Zoom in">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={() => animateTo(autoView(a, b, focus))} aria-label="Fit the route in view">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Pin({ x, y, letter }: { x: number; y: number; letter: string }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} pointerEvents="none">
      <circle r="19" className="globe-pin-ring" />
      <circle r="12.5" className="globe-pin" />
      <text className="globe-pin-text" textAnchor="middle" dy="4.4">
        {letter}
      </text>
    </g>
  );
}

function Tag({
  x,
  y,
  text,
  align,
  tone = 'paper',
}: {
  x: number;
  y: number;
  text: string;
  align: 'left' | 'right' | 'center';
  tone?: 'paper' | 'course';
}) {
  const label = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  const w = textWidth(label);
  const h = 26;
  let left: number;
  if (align === 'center') left = x - w / 2;
  else if (align === 'right') left = x + 20;
  else left = x - 20 - w;
  if (left < 6) left = align === 'left' ? x + 20 : 6;
  if (left + w > SIZE - 6) left = align === 'right' ? x - 20 - w : SIZE - 6 - w;
  left = Math.max(6, Math.min(SIZE - 6 - w, left));
  const top = Math.max(6, Math.min(SIZE - 6 - h, y - h / 2));
  return (
    <g transform={`translate(${left.toFixed(1)} ${top.toFixed(1)})`} pointerEvents="none">
      <rect width={w} height={h} rx={h / 2} className={tone === 'course' ? 'globe-tag-course' : 'globe-tag'} />
      <text
        x={w / 2}
        y={17.5}
        textAnchor="middle"
        className={tone === 'course' ? 'globe-tag-text-course' : 'globe-tag-text'}
      >
        {label}
      </text>
    </g>
  );
}
