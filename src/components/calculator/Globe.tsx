import { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoInterpolate } from 'd3-geo';
import type { LatLon } from '../../lib/geo';
import { haversine, midpoint, MEAN_EARTH_RADIUS_M } from '../../lib/geo';
import { land } from './land';

interface Props {
  a: LatLon | null;
  b: LatLon | null;
  labelA?: string;
  labelB?: string;
  /** e.g. "3,471 mi", shown on the route */
  distanceLabel?: string;
  picking: 'a' | 'b' | null;
  onPick: (which: 'a' | 'b', point: LatLon) => void;
}

interface View {
  rot: [number, number];
  scale: number;
}

const SIZE = 500;
const BASE = 214;
const MIN_SCALE = BASE * 0.85;
const MAX_SCALE = BASE * 40;
const graticule = geoGraticule10();
const clampLat = (v: number) => Math.max(-89, Math.min(89, v));

function autoView(a: LatLon | null, b: LatLon | null): View {
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

/**
 * An interactive globe. It turns to face each new route, can be dragged and
 * zoomed, and accepts a click to place a point while picking.
 */
export default function Globe({ a, b, labelA = '', labelB = '', distanceLabel, picking, onPick }: Props) {
  const [view, setView] = useState<View>(() => autoView(a, b));
  const viewRef = useRef(view);
  viewRef.current = view;
  const svgRef = useRef<SVGSVGElement>(null);
  const anim = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; rot: [number, number]; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  function animateTo(target: View) {
    if (anim.current) cancelAnimationFrame(anim.current);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = viewRef.current;
    if (reduce) {
      setView(target);
      return;
    }
    // take the short way round in longitude
    let dLon = ((target.rot[0] - from.rot[0] + 540) % 360) - 180;
    const dLat = target.rot[1] - from.rot[1];
    const logFrom = Math.log(from.scale);
    const logTo = Math.log(target.scale);
    const start = performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setView({
        rot: [from.rot[0] + dLon * e, from.rot[1] + dLat * e],
        scale: Math.exp(logFrom + (logTo - logFrom) * e),
      });
      if (t < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }

  // Turn to face each new route.
  useEffect(() => {
    animateTo(autoView(a, b));
  }, [a?.lat, a?.lon, b?.lat, b?.lon]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  const scene = useMemo(() => {
    const projection = geoOrthographic()
      .rotate(view.rot)
      .scale(view.scale)
      .translate([SIZE / 2, SIZE / 2])
      .clipAngle(90);
    const path = geoPath(projection).digits(1);
    const centre: [number, number] = [-view.rot[0], -view.rot[1]];
    const facing = (p: LatLon) => geoDistance([p.lon, p.lat], centre) < Math.PI / 2 - 0.015;
    const pin = (p: LatLon | null) => (p && facing(p) ? projection([p.lon, p.lat]) : null);
    let mid: [number, number] | null = null;
    if (a && b) {
      const m = geoInterpolate([a.lon, a.lat], [b.lon, b.lat])(0.5);
      if (geoDistance(m, centre) < Math.PI / 2 - 0.05) mid = projection(m);
    }
    return {
      projection,
      sphere: path({ type: 'Sphere' }) ?? '',
      grid: path(graticule) ?? '',
      land: path(land) ?? '',
      arc:
        a && b
          ? (path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }) ?? '')
          : '',
      pa: pin(a),
      pb: pin(b),
      mid,
    };
  }, [view, a?.lat, a?.lon, b?.lat, b?.lon]);

  function toSvg(e: { clientX: number; clientY: number }) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
      k: SIZE / rect.width,
    };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rot: viewRef.current.rot, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    const { k } = toSvg(e);
    const degPerUnit = 180 / (Math.PI * viewRef.current.scale);
    setView((v) => ({
      ...v,
      rot: [d.rot[0] + dx * k * degPerUnit, clampLat(d.rot[1] - dy * k * degPerUnit)],
    }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved || !picking) return;
    const { x, y } = toSvg(e);
    const r = Math.hypot(x - SIZE / 2, y - SIZE / 2);
    if (r > viewRef.current.scale) return;
    const ll = scene.projection.invert?.([x, y]);
    if (ll) onPick(picking, { lat: ll[1], lon: ((((ll[0] + 180) % 360) + 360) % 360) - 180 });
  }

  function zoom(f: number) {
    if (anim.current) cancelAnimationFrame(anim.current);
    setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f)) }));
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
  }

  const description =
    a && b
      ? `Globe showing the straight line path from ${labelA} to ${labelB}${distanceLabel ? `, ${distanceLabel}` : ''}. Drag or use the arrow keys to turn it.`
      : 'Globe. Enter two places to draw the straight line path between them.';
  const arcKey = `${a?.lat},${a?.lon},${b?.lat},${b?.lon}`;

  // Keep the two name tags from colliding: the left-most pin's tag goes left.
  const leftFirst = scene.pa && scene.pb ? scene.pa[0] <= scene.pb[0] : true;

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
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
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
        {view.scale < SIZE && (
          <circle cx={SIZE / 2} cy={SIZE / 2} r={view.scale * 1.12} fill="url(#globe-halo)" />
        )}
        <path d={scene.sphere} className="globe-sea" />
        <path d={scene.grid} className="globe-grid" />
        <path d={scene.land} className="globe-land" />
        <path d={scene.sphere} fill="url(#globe-shade)" pointerEvents="none" />
        {scene.arc && (
          <g pointerEvents="none">
            <path d={scene.arc} className="globe-arc-glow" />
            <path key={arcKey} d={scene.arc} className="globe-arc" pathLength={1} />
          </g>
        )}
        {scene.pa && <Pin x={scene.pa[0]} y={scene.pa[1]} letter="A" />}
        {scene.pb && <Pin x={scene.pb[0]} y={scene.pb[1]} letter="B" />}
        {scene.pa && labelA && (
          <Tag x={scene.pa[0]} y={scene.pa[1]} text={labelA} align={leftFirst ? 'left' : 'right'} />
        )}
        {scene.pb && labelB && (
          <Tag x={scene.pb[0]} y={scene.pb[1]} text={labelB} align={leftFirst ? 'right' : 'left'} />
        )}
        {scene.mid && distanceLabel && (
          <Tag x={scene.mid[0]} y={scene.mid[1] - 18} text={distanceLabel} tone="course" align="center" />
        )}
      </svg>

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
        <button type="button" onClick={() => animateTo(autoView(a, b))} aria-label="Fit the route in view">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  // keep the tag inside the frame
  if (left < 6) left = align === 'left' ? x + 20 : 6;
  if (left + w > SIZE - 6) left = align === 'right' ? x - 20 - w : SIZE - 6 - w;
  left = Math.max(6, Math.min(SIZE - 6 - w, left));
  const top = Math.max(6, Math.min(SIZE - 6 - h, y - h / 2));
  return (
    <g transform={`translate(${left.toFixed(1)} ${top.toFixed(1)})`} pointerEvents="none">
      <rect width={w} height={h} rx={h / 2} className={tone === 'course' ? 'globe-tag-course' : 'globe-tag'} />
      <text x={w / 2} y={17.5} textAnchor="middle" className={tone === 'course' ? 'globe-tag-text-course' : 'globe-tag-text'}>
        {label}
      </text>
    </g>
  );
}
