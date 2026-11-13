import type { Place } from '../../lib/geo';
import { parseCoordinates, formatCoord } from '../../lib/geo';

export interface Suggestion extends Place {
  /** first line in the suggestion list, when shorter than the full name */
  title?: string;
  /** second line shown under the name */
  detail: string;
  source: 'city' | 'search' | 'coords';
}

type CityRow = [name: string, admin: string, country: string, lat: number, lon: number];

let cities: CityRow[] | null = null;
let citiesPromise: Promise<CityRow[]> | null = null;
let regionNames: Intl.DisplayNames | null = null;

function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Loads the built-in city list once. Safe to call repeatedly. */
export function loadCities(): Promise<CityRow[]> {
  citiesPromise ??= fetch('/data/cities.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: CityRow[]) => (cities = rows))
    .catch(() => (cities = []));
  return citiesPromise;
}

function cityToSuggestion(c: CityRow): Suggestion {
  const country = countryName(c[2]);
  const isUS = c[2] === 'US';
  return {
    name: isUS ? `${c[0]}, ${c[1]}` : `${c[0]}, ${country}`,
    title: c[0],
    detail: isUS ? `${c[1]}, ${country}` : country,
    lat: c[3],
    lon: c[4],
    source: 'city',
  };
}

/** Instant matches from the built-in list, biggest cities first. */
export function searchCities(query: string, limit = 5): Suggestion[] {
  const q = fold(query.split(',')[0]);
  if (!cities || q.length < 2) return [];
  const starts: CityRow[] = [];
  const contains: CityRow[] = [];
  for (const c of cities) {
    const n = fold(c[0]);
    if (n.startsWith(q)) starts.push(c);
    else if (q.length >= 4 && n.includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit).map(cityToSuggestion);
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

function photonToSuggestion(f: PhotonFeature): Suggestion | null {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const title = p.name ?? (street || p.city || p.postcode);
  if (!title || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const parts = [p.name && street ? street : '', p.city, p.state, p.country].filter(
    (x, i, all): x is string => Boolean(x) && x !== title && all.indexOf(x) === i,
  );
  const region = p.city && p.city !== title ? p.city : (p.state ?? p.country ?? '');
  return {
    name: region && region !== title ? `${title}, ${region}` : title,
    detail: parts.join(', '),
    lat,
    lon,
    source: 'search',
  };
}

/** Worldwide address and place search (Photon, built on OpenStreetMap data). */
export async function searchPlaces(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).map(photonToSuggestion).filter((s): s is Suggestion => s !== null);
}

/** Nearest named place for a point picked on the map. Returns null when nothing is close. */
export async function nameForPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, {
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const s = data.features?.[0] ? photonToSuggestion(data.features[0]) : null;
    return s ? s.name : null;
  } catch {
    return null;
  }
}

export function coordsSuggestion(query: string): Suggestion | null {
  const p = parseCoordinates(query);
  if (!p) return null;
  return { ...p, name: formatCoord(p), detail: 'Coordinates', source: 'coords' };
}
