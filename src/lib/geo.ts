// Distance maths for the calculator and for the figures built at compile time.
// Distances are returned in metres; angles in degrees.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Place extends LatLon {
  name: string;
}

export const METRES_PER_MILE = 1609.344;
export const METRES_PER_NAUTICAL_MILE = 1852;
export const METRES_PER_FOOT = 0.3048;
export const MEAN_EARTH_RADIUS_M = 6371008.8;

// WGS 84 ellipsoid
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Great-circle distance on a sphere of mean Earth radius (haversine formula). */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing along the great circle from a to b, 0 to 360 clockwise from north. */
export function sphericalBearing(a: LatLon, b: LatLon): number {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}

export interface Geodesic {
  /** metres */
  distance: number;
  /** degrees, direction of travel when leaving the start */
  initialBearing: number;
  /** degrees, direction of travel on arrival */
  finalBearing: number;
  /** which model produced the distance */
  method: 'ellipsoid' | 'sphere';
}

/**
 * Vincenty's inverse solution on the WGS 84 ellipsoid. Falls back to the
 * spherical result for the rare nearly antipodal pairs where the iteration
 * does not converge.
 */
export function geodesic(a: LatLon, b: LatLon): Geodesic {
  if (Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(norm360(a.lon - b.lon)) < 1e-12) {
    return { distance: 0, initialBearing: 0, finalBearing: 0, method: 'ellipsoid' };
  }
  const L = rad(b.lon - a.lon);
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(rad(a.lat)));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(rad(b.lat)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  let sinLambda = 0;
  let cosLambda = 0;
  let converged = false;

  for (let i = 0; i < 200; i++) {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) break;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const next =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(next - lambda) < 1e-12) {
      lambda = next;
      converged = true;
      break;
    }
    lambda = next;
  }

  if (!converged || !Number.isFinite(sigma)) {
    const initial = sphericalBearing(a, b);
    const final = norm360(sphericalBearing(b, a) + 180);
    return { distance: haversine(a, b), initialBearing: initial, finalBearing: final, method: 'sphere' };
  }

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distance = WGS84_B * A * (sigma - deltaSigma);
  sinLambda = Math.sin(lambda);
  cosLambda = Math.cos(lambda);
  const initialBearing = norm360(
    deg(Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)),
  );
  const finalBearing = norm360(
    deg(Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda)),
  );
  return { distance, initialBearing, finalBearing, method: 'ellipsoid' };
}

/** Point a given fraction (0 to 1) of the way along the great circle from a to b. */
export function intermediate(a: LatLon, b: LatLon, f: number): LatLon {
  const p1 = rad(a.lat);
  const l1 = rad(a.lon);
  const p2 = rad(b.lat);
  const l2 = rad(b.lon);
  const h =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: deg(Math.atan2(y, x)) };
}

export const midpoint = (a: LatLon, b: LatLon) => intermediate(a, b, 0.5);

/**
 * Points along the great circle, with longitudes unwrapped so the line stays
 * continuous when it crosses the 180 degree meridian.
 */
export function greatCirclePath(a: LatLon, b: LatLon, steps = 96): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const p = intermediate(a, b, i / steps);
    let lon = p.lon;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    prev = lon;
    out.push([lon, p.lat]);
  }
  return out;
}

/** Length of the constant-bearing line (rhumb line) between two points, on the sphere. */
export function rhumbDistance(a: LatLon, b: LatLon): number {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dPhi = p2 - p1;
  let dLon = Math.abs(rad(b.lon - a.lon));
  if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
  const dPsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  const q = Math.abs(dPsi) > 1e-12 ? dPhi / dPsi : Math.cos(p1);
  return Math.sqrt(dPhi * dPhi + q * q * dLon * dLon) * MEAN_EARTH_RADIUS_M;
}

const COMPASS_16 = [
  ['N', 'north'],
  ['NNE', 'north-northeast'],
  ['NE', 'northeast'],
  ['ENE', 'east-northeast'],
  ['E', 'east'],
  ['ESE', 'east-southeast'],
  ['SE', 'southeast'],
  ['SSE', 'south-southeast'],
  ['S', 'south'],
  ['SSW', 'south-southwest'],
  ['SW', 'southwest'],
  ['WSW', 'west-southwest'],
  ['W', 'west'],
  ['WNW', 'west-northwest'],
  ['NW', 'northwest'],
  ['NNW', 'north-northwest'],
] as const;

export function compass(bearing: number): { abbr: string; name: string } {
  const i = Math.round(norm360(bearing) / 22.5) % 16;
  return { abbr: COMPASS_16[i][0], name: COMPASS_16[i][1] };
}

export type Unit = 'mi' | 'km' | 'nmi';

export const UNIT_LABEL: Record<Unit, { short: string; long: string }> = {
  mi: { short: 'mi', long: 'miles' },
  km: { short: 'km', long: 'kilometers' },
  nmi: { short: 'nmi', long: 'nautical miles' },
};

export function toUnit(metres: number, unit: Unit): number {
  if (unit === 'mi') return metres / METRES_PER_MILE;
  if (unit === 'km') return metres / 1000;
  return metres / METRES_PER_NAUTICAL_MILE;
}

export function formatNumber(value: number, digits?: number): string {
  const d = digits ?? (value >= 100 ? 0 : value >= 10 ? 1 : 2);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatDistance(metres: number, unit: Unit): string {
  return `${formatNumber(toUnit(metres, unit))} ${UNIT_LABEL[unit].short}`;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '';
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 1) return 'under a minute';
  const days = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (days > 0) return `${days} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatCoord(p: LatLon, digits = 4): string {
  const ns = p.lat >= 0 ? 'N' : 'S';
  const ew = p.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(p.lat).toFixed(digits)}° ${ns}, ${Math.abs(p.lon).toFixed(digits)}° ${ew}`;
}

/** Reads "40.7128, -74.0060" or "40.7128 N 74.0060 W" style input. */
export function parseCoordinates(input: string): LatLon | null {
  const s = input.trim();
  const m = s.match(
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/,
  );
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lon = parseFloat(m[3]);
  if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
  if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Longitude folded back into -180 to 180. */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Point reached by travelling `distance` metres from `p` on an initial `bearing`, on the sphere. */
export function destination(p: LatLon, bearing: number, distance: number): LatLon {
  const d = distance / MEAN_EARTH_RADIUS_M;
  const t = rad(bearing);
  const p1 = rad(p.lat);
  const l1 = rad(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: wrapLon(deg(l2)) };
}

/**
 * The ring of points exactly `radius` metres from `center` over the Earth's surface,
 * as [lon, lat] pairs with longitudes kept continuous around the center.
 */
export function circleRing(center: LatLon, radius: number, steps = 128): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const q = destination(center, (i / steps) * 360, radius);
    let lon = q.lon;
    while (lon - center.lon > 180) lon -= 360;
    while (lon - center.lon < -180) lon += 360;
    ring.push([lon, q.lat]);
  }
  return ring;
}

/** Area inside a circle drawn on the Earth's surface (a spherical cap), in square metres. */
export function capArea(radius: number): number {
  const R = MEAN_EARTH_RADIUS_M;
  return 2 * Math.PI * R * R * (1 - Math.cos(radius / R));
}

/** Length of the circle's edge measured on the Earth's surface, in metres. */
export function capCircumference(radius: number): number {
  return 2 * Math.PI * MEAN_EARTH_RADIUS_M * Math.sin(radius / MEAN_EARTH_RADIUS_M);
}

export const METRES_PER_SQ_MILE = METRES_PER_MILE * METRES_PER_MILE;

export type RadiusUnit = 'mi' | 'km' | 'm' | 'ft' | 'nmi';
export const RADIUS_UNIT: Record<RadiusUnit, { short: string; long: string; metres: number }> = {
  mi: { short: 'mi', long: 'miles', metres: METRES_PER_MILE },
  km: { short: 'km', long: 'kilometers', metres: 1000 },
  m: { short: 'm', long: 'meters', metres: 1 },
  ft: { short: 'ft', long: 'feet', metres: METRES_PER_FOOT },
  nmi: { short: 'nmi', long: 'nautical miles', metres: METRES_PER_NAUTICAL_MILE },
};
