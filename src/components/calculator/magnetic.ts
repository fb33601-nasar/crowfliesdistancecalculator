// Magnetic declination from the World Magnetic Model 2025 (NOAA / BGS), via the geomagnetism package.
// Only the WMM2025 coefficients are bundled.
// @ts-expect-error untyped internal module
import Model from 'geomagnetism/lib/model.js';
import wmm2025 from 'geomagnetism/data/wmm-2025.json';
import type { LatLon } from '../../lib/geo';

let model: { getTimedModel: (d: Date, allowOut?: boolean) => { point: (p: number[]) => { decl: number; incl: number } } } | null = null;

/** Declination in degrees, east positive, at a place today. Null if the model cannot be evaluated. */
export function declination(p: LatLon, at = new Date()): number | null {
  try {
    model ??= new Model(wmm2025);
    const v = model!.getTimedModel(at, false).point([p.lat, p.lon]).decl;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
