import { useMemo } from 'react';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import type { LatLon } from '../../lib/geo';
import { haversine, midpoint, MEAN_EARTH_RADIUS_M } from '../../lib/geo';
import { land } from './land';

interface Props {
  a: LatLon | null;
  b: LatLon | null;
  labelA?: string;
  labelB?: string;
}

const SIZE = 440;
const BASE_RADIUS = 196;
const graticule = geoGraticule10();

/**
 * A globe turned so the route sits in the middle. On a globe the shortest path
 * looks like what it is: a straight run over the surface.
 */
export default function Globe({ a, b, labelA = 'Start', labelB = 'End' }: Props) {
  const view = useMemo(() => {
    const both = a && b;
    const centre = both ? midpoint(a, b) : (a ?? b ?? { lat: 28, lon: -38 });
    const angle = both ? haversine(a, b) / MEAN_EARTH_RADIUS_M : Math.PI / 2;
    // Zoom in on short hops so the two ends do not sit on top of each other.
    const wanted = 84 / Math.max(Math.sin(angle / 2), 0.02);
    const radius = Math.min(Math.max(BASE_RADIUS, wanted), BASE_RADIUS * 9);
    const projection = geoOrthographic()
      .rotate([-centre.lon, -centre.lat])
      .scale(radius)
      .translate([SIZE / 2, SIZE / 2])
      .clipAngle(90);
    const path = geoPath(projection).digits(1);
    const pa = a ? projection([a.lon, a.lat]) : null;
    const pb = b ? projection([b.lon, b.lat]) : null;
    return {
      radius,
      sphere: path({ type: 'Sphere' }) ?? '',
      grid: path(graticule) ?? '',
      land: path(land) ?? '',
      arc: both
        ? (path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }) ?? '')
        : '',
      pa,
      pb,
    };
  }, [a?.lat, a?.lon, b?.lat, b?.lon]);

  const description =
    a && b
      ? `Globe showing the straight line path from ${labelA} to ${labelB}.`
      : 'Globe. Enter two places to draw the straight line path between them.';
  const arcKey = `${a?.lat},${a?.lon},${b?.lat},${b?.lon}`;

  return (
    <svg className="globe" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={description}>
      <defs>
        <radialGradient id="globe-shade" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <path d={view.sphere} className="globe-sea" />
      <path d={view.grid} className="globe-grid" />
      <path d={view.land} className="globe-land" />
      <path d={view.sphere} fill="url(#globe-shade)" />
      {view.arc && (
        <>
          <path d={view.arc} className="globe-arc-glow" />
          <path key={arcKey} d={view.arc} className="globe-arc" pathLength={1} />
        </>
      )}
      {view.pa && <Pin x={view.pa[0]} y={view.pa[1]} letter="A" />}
      {view.pb && <Pin x={view.pb[0]} y={view.pb[1]} letter="B" />}
    </svg>
  );
}

function Pin({ x, y, letter }: { x: number; y: number; letter: string }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <circle r="12" className="globe-pin" />
      <text className="globe-pin-text" textAnchor="middle" dy="4.4">
        {letter}
      </text>
    </g>
  );
}
