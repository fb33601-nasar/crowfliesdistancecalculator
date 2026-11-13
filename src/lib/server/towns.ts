// Build-time helpers over public/data/towns.json for the programmatic radius pages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { haversine, sphericalBearing } from '../geo';

export type TownRow = [name: string, admin: string, country: string, lat: number, lon: number, pop100: number];
let cache: TownRow[] | null = null;
export const towns = (): TownRow[] => (cache ??= JSON.parse(readFileSync(join(process.cwd(), 'public/data/towns.json'), 'utf8')));

const regions = new Intl.DisplayNames(['en'], { type: 'region' });
export const townLabel = (t: TownRow) =>
  t[2] === 'US' ? `${t[0]}, ${t[1]}` : t[2] === 'GB' ? t[0] : `${t[0]}, ${regions.of(t[2]) ?? t[2]}`;

export interface RingResult {
  inside: number;
  picks: { t: TownRow; d: number; b: number }[];
}

/** Towns inside a circle, and up to three big towns near its edge in different directions. */
export function ringAround(name: string, lat: number, lon: number, radius: number, band: [number, number] = [0.85, 1.05]): RingResult {
  const c = { lat, lon };
  let inside = 0;
  const ring: RingResult['picks'] = [];
  const latSpan = (radius * 1.1) / 111_000 + 0.05;
  for (const t of towns()) {
    if (Math.abs(t[3] - lat) > latSpan) continue;
    const p = { lat: t[3], lon: t[4] };
    const d = haversine(c, p);
    if (d <= radius) inside++;
    if (d >= radius * band[0] && d <= radius * band[1] && t[0] !== name) ring.push({ t, d, b: sphericalBearing(c, p) });
  }
  ring.sort((a, b) => b.t[5] - a.t[5]);
  const picks: RingResult['picks'] = [];
  for (const x of ring) {
    if (picks.some((p) => Math.abs(((p.b - x.b + 540) % 360) - 180) < 60)) continue;
    picks.push(x);
    if (picks.length === 3) break;
  }
  return { inside, picks };
}

/** Nearest reference area, phrased for prose. */
export function compareArea(sqmi: number, refs: [string, number][], fmt: (v: number, d?: number) => string): string {
  const ref = [...refs].sort((a, b) => Math.abs(Math.log(a[1] / sqmi)) - Math.abs(Math.log(b[1] / sqmi)))[0];
  const ratio = sqmi / ref[1];
  if (ratio > 1.15) return `about ${fmt(ratio, ratio < 10 ? 1 : 0)} times the size of ${ref[0]}`;
  if (ratio < 0.87) return 1 / ratio < 10 ? `about ${fmt(ratio * 100, 0)}% of the size of ${ref[0]}` : `about 1/${Math.round(1 / ratio)} of the size of ${ref[0]}`;
  return ratio >= 1 ? `a little larger than ${ref[0]}` : `a little smaller than ${ref[0]}`;
}
