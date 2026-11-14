import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { LatLon } from '../../lib/geo';
import { circleRing, haversine } from '../../lib/geo';

export type Costing = 'auto' | 'bicycle' | 'pedestrian';
export interface Band {
  minutes: number;
  geometry: Polygon | MultiPolygon;
  estimated: boolean;
}

const ENDPOINT = 'https://valhalla1.openstreetmap.de/isochrone';
let last = 0;
const cache = new Map<string, Band[]>();

/** Travel-time areas from the FOSSGIS Valhalla server (OpenStreetMap data), largest last. */
export async function getIsochrones(center: LatLon, costing: Costing, minutes: number[], signal?: AbortSignal): Promise<Band[]> {
  const times = [...new Set(minutes)].sort((a, b) => a - b).slice(0, 4);
  const key = `${center.lat.toFixed(4)},${center.lon.toFixed(4)}|${costing}|${times.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const wait = Math.max(0, last + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const body = {
    locations: [{ lat: center.lat, lon: center.lon }],
    costing,
    contours: times.map((t) => ({ time: t })),
    polygons: true,
    denoise: 0.4,
    generalize: 60,
  };
  const res = await fetch(`${ENDPOINT}?json=${encodeURIComponent(JSON.stringify(body))}`, { signal });
  if (!res.ok) throw new Error(`isochrone ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;
  const bands: Band[] = fc.features
    .filter((f): f is Feature<Polygon | MultiPolygon> => !!f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => ({ minutes: Number(f.properties?.contour), geometry: f.geometry, estimated: false }))
    .filter((b) => Number.isFinite(b.minutes))
    .sort((a, b) => a.minutes - b.minutes);
  if (!bands.length) throw new Error('no isochrone');
  cache.set(key, bands);
  return bands;
}

/** Fallback when the service is unavailable: circles at a typical straight-line speed. */
export function estimatedBands(center: LatLon, costing: Costing, minutes: number[]): Band[] {
  const mph = (m: number) => (costing === 'pedestrian' ? 3 : costing === 'bicycle' ? 11 : m <= 30 ? 30 : m <= 60 ? 40 : m <= 120 ? 50 : 60);
  return [...new Set(minutes)]
    .sort((a, b) => a - b)
    .map((m) => {
      const ring = circleRing(center, ((m / 60) * mph(m) * 1609.344) / 1.19, 96);
      return { minutes: m, geometry: { type: 'Polygon', coordinates: [ring] } as Polygon, estimated: true };
    });
}

const polys = (g: Polygon | MultiPolygon): number[][][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/** Area in square metres on a sphere (holes subtracted). */
export function area(g: Polygon | MultiPolygon): number {
  const R = 6371008.8;
  const ringArea = (ring: number[][]) => {
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [l1, p1] = ring[i];
      const [l2, p2] = ring[i + 1];
      s += ((l2 - l1) * Math.PI) / 180 * (2 + Math.sin((p1 * Math.PI) / 180) + Math.sin((p2 * Math.PI) / 180));
    }
    return Math.abs((s * R * R) / 2);
  };
  return polys(g).reduce((sum, p) => sum + ringArea(p[0]) - p.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

function inRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function contains(g: Polygon | MultiPolygon, p: LatLon): boolean {
  const pt: [number, number] = [p.lon, p.lat];
  return polys(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
}

/** Farthest straight-line reach of an area from the center, in metres. */
export function reach(g: Polygon | MultiPolygon, center: LatLon): number {
  let max = 0;
  for (const poly of polys(g)) for (const [lon, lat] of poly[0]) max = Math.max(max, haversine(center, { lat, lon }));
  return max;
}

export function bbox(g: Polygon | MultiPolygon): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of polys(g)) for (const [lon, lat] of poly[0]) {
    a = Math.min(a, lon); b = Math.min(b, lat); c = Math.max(c, lon); d = Math.max(d, lat);
  }
  return [a, b, c, d];
}
