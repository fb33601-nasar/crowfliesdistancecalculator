// Road, cycling and walking routes from the FOSSGIS OSRM server (OpenStreetMap data).
// Their fair-use policy allows at most one request per second, so requests are queued.
import type { LatLon } from '../../lib/geo';

export type Profile = 'car' | 'bike' | 'foot';

export interface Route {
  /** metres along the route */
  distance: number;
  /** seconds, free-flowing traffic, no stops */
  duration: number;
  /** [lon, lat] points */
  line: [number, number][];
  /** seconds for each segment between consecutive line points, when the server sends them */
  segDurations?: number[];
}

export type RouteState =
  | { status: 'loading' }
  | { status: 'ok'; route: Route }
  | { status: 'none' }
  | { status: 'error' };

const BASE = 'https://routing.openstreetmap.de/routed-';
const GAP_MS = 1100;

const cache = new Map<string, Promise<Route | null>>();
let lastStart = 0;
let chain: Promise<unknown> = Promise.resolve();

const key = (p: Profile, a: LatLon, b: LatLon) =>
  `${p}:${a.lat.toFixed(5)},${a.lon.toFixed(5)};${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;

/** Waits for its turn so requests leave at least GAP_MS apart. */
function slot(): Promise<void> {
  const turn = chain.then(async () => {
    const wait = lastStart + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
  });
  chain = turn.catch(() => undefined);
  return turn;
}

async function request(profile: Profile, a: LatLon, b: LatLon): Promise<Route | null> {
  await slot();
  const url =
    `${BASE}${profile}/route/v1/driving/${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}` +
    '?overview=full&geometries=geojson&alternatives=false&steps=false&annotations=duration';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs?: { annotation?: { duration?: number[] } }[] }[];
  };
  if (data.code === 'NoRoute' || !data.routes?.length) return null;
  if (data.code !== 'Ok') throw new Error(data.code);
  const r = data.routes[0];
  const seg = r.legs?.[0]?.annotation?.duration;
  return {
    distance: r.distance,
    duration: r.duration,
    line: r.geometry.coordinates,
    segDurations: seg && seg.length === r.geometry.coordinates.length - 1 ? seg : undefined,
  };
}

/** One route, cached for the session. Resolves to null when no route exists. */
export function getRoute(profile: Profile, a: LatLon, b: LatLon): Promise<Route | null> {
  const k = key(profile, a, b);
  let p = cache.get(k);
  if (!p) {
    p = request(profile, a, b);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

export const PROFILE_LABEL: Record<Profile, string> = {
  car: 'Driving',
  bike: 'Cycling',
  foot: 'Walking',
};
