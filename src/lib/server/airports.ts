// Build-time airport lookups for the air miles figures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geodesic } from '../geo';

type Row = [string, string, string, string, string, number, number, number, string];
let map: Map<string, { iata: string; name: string; city: string; country: string; lat: number; lon: number; tz: string }> | null = null;
export function airport(code: string) {
  map ??= new Map(
    (JSON.parse(readFileSync(join(process.cwd(), 'public/data/airports.json'), 'utf8')) as Row[]).map((r) => [
      r[0],
      { iata: r[0], name: r[2], city: r[3], country: r[4], lat: r[5], lon: r[6], tz: r[8] },
    ]),
  );
  const a = map.get(code);
  if (!a) throw new Error(`Unknown airport ${code}`);
  return a;
}
export const MI = 1609.344;
export const airMiles = (x: string, y: string) => geodesic(airport(x), airport(y)).distance / MI;
export const flightHours = (miles: number) => 0.5 + miles / 500;
export const airportCount = () => {
  airport('JFK');
  return map!.size;
};
