import type { LatLon } from '../../lib/geo';
import { haversine } from '../../lib/geo';

export interface Airport extends LatLon {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  /** 3 large, 2 medium, 1 small */
  size: number;
  tz: string;
}
type Row = [string, string, string, string, string, number, number, number, string];

let all: Airport[] = [];
let byCode = new Map<string, Airport>();
let loading: Promise<Airport[]> | null = null;
let regions: Intl.DisplayNames | null = null;

export function countryOf(code: string): string {
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

/** About 4,000 airports with scheduled passenger flights, from OurAirports. */
export function loadAirports(): Promise<Airport[]> {
  loading ??= fetch('/data/airports.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: Row[]) => {
      all = rows.map((r) => ({ iata: r[0], icao: r[1], name: r[2], city: r[3], country: r[4], lat: r[5], lon: r[6], size: r[7], tz: r[8] }));
      byCode = new Map(all.map((a) => [a.iata, a]));
      return all;
    })
    .catch(() => []);
  return loading;
}

export const airportByCode = (code: string) => byCode.get(code.toUpperCase());

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ranked matches: IATA code, ICAO code, city, then airport name; bigger airports first. */
export function searchAirports(query: string, limit = 7): Airport[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of all) {
    let s = 0;
    if (a.iata.toLowerCase() === q) s = 100;
    else if (a.icao.toLowerCase() === q) s = 90;
    else {
      const city = fold(a.city);
      const name = fold(a.name);
      if (city === q) s = 70;
      else if (city.startsWith(q)) s = 55;
      else if (name.startsWith(q)) s = 50;
      else if (q.length >= 3 && (name.includes(q) || city.includes(q))) s = 35;
      else if (q.length >= 3 && fold(countryOf(a.country)).startsWith(q)) s = 15;
    }
    if (s) scored.push({ a, s: s + a.size * 4 });
  }
  return scored.sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
}

/** Nearest airport to a point, preferring larger ones when they are nearly as close. */
export function nearestAirport(p: LatLon): Airport | null {
  let best: Airport | null = null;
  let bestScore = Infinity;
  for (const a of all) {
    if (Math.abs(a.lat - p.lat) > 5) continue;
    const d = haversine(p, a);
    const score = d / (a.size === 3 ? 1.6 : a.size === 2 ? 1.2 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export const airportLabel = (a: Airport) => `${a.iata} · ${a.city || a.name}`;
