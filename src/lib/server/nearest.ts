import { haversine } from '../geo';
import type { LatLon } from '../geo';
import { towns, townLabel } from './towns';
/** Nearest listed town to a point, with its distance in metres. */
export function nearestTown(p: LatLon) {
  let best: { label: string; d: number } | null = null;
  for (const t of towns()) {
    if (Math.abs(t[3] - p.lat) > 3) continue;
    const d = haversine(p, { lat: t[3], lon: t[4] });
    if (!best || d < best.d) best = { label: townLabel(t), d };
  }
  return best;
}
