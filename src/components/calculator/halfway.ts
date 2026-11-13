import type { LatLon } from '../../lib/geo';
import { haversine } from '../../lib/geo';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Geographic midpoint (center of gravity on the sphere) of any number of places, with optional weights. */
export function centroid(points: LatLon[], weights?: number[]): LatLon | null {
  if (!points.length) return null;
  let x = 0, y = 0, z = 0, w = 0;
  points.forEach((p, i) => {
    const k = weights?.[i] ?? 1;
    const la = rad(p.lat), lo = rad(p.lon);
    x += Math.cos(la) * Math.cos(lo) * k;
    y += Math.cos(la) * Math.sin(lo) * k;
    z += Math.sin(la) * k;
    w += k;
  });
  x /= w; y /= w; z /= w;
  const hyp = Math.hypot(x, y);
  if (hyp < 1e-12 && Math.abs(z) < 1e-12) return null; // places cancel out, e.g. antipodes
  return { lat: deg(Math.atan2(z, hyp)), lon: deg(Math.atan2(y, x)) };
}

/** Point a given share of the way along a line of [lon, lat] points, measured by distance or by segment weights. */
export function alongLine(line: [number, number][], share: number, segWeights?: number[]): LatLon | null {
  if (line.length < 2) return null;
  const segs: number[] = [];
  for (let i = 1; i < line.length; i++) {
    segs.push(segWeights ? segWeights[i - 1] : haversine({ lat: line[i - 1][1], lon: line[i - 1][0] }, { lat: line[i][1], lon: line[i][0] }));
  }
  const total = segs.reduce((s, v) => s + v, 0);
  let left = total * share;
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i] || i === segs.length - 1) {
      const f = segs[i] > 0 ? Math.min(left / segs[i], 1) : 0;
      const [lo1, la1] = line[i];
      const [lo2, la2] = line[i + 1];
      return { lat: la1 + (la2 - la1) * f, lon: lo1 + (lo2 - lo1) * f };
    }
    left -= segs[i];
  }
  return null;
}

/** Road distance from the start of the line to a point found with alongLine, in metres. */
export function lineLength(line: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) d += haversine({ lat: line[i - 1][1], lon: line[i - 1][0] }, { lat: line[i][1], lon: line[i][0] });
  return d;
}
