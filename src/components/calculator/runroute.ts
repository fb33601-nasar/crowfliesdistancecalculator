import type { LatLon } from '../../lib/geo';
import { haversine } from '../../lib/geo';

/** Google encoded polyline (precision 5), used to keep a drawn route in a share link. */
export function encodePolyline(points: LatLon[]): string {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const la = Math.round(p.lat * 1e5);
    const lo = Math.round(p.lon * 1e5);
    out += enc(la - pLat) + enc(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

export function decodePolyline(str: string, max = 400): LatLon[] {
  const pts: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      if (i >= str.length) throw new Error('bad polyline');
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  try {
    while (i < str.length && pts.length < max) {
      lat += next();
      lon += next();
      const p = { lat: lat / 1e5, lon: lon / 1e5 };
      if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return [];
      pts.push(p);
    }
  } catch {
    return [];
  }
  return pts;
}

/** Length of a [lon, lat] line in metres. */
export function pathLength(line: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) d += haversine({ lat: line[i - 1][1], lon: line[i - 1][0] }, { lat: line[i][1], lon: line[i][0] });
  return d;
}

/** Points every `step` metres along a [lon, lat] line, e.g. mile markers. */
export function markersAlong(line: [number, number][], step: number, max = 200): { p: LatLon; n: number }[] {
  const out: { p: LatLon; n: number }[] = [];
  let next = step;
  let done = 0;
  for (let i = 1; i < line.length && out.length < max; i++) {
    const a = { lat: line[i - 1][1], lon: line[i - 1][0] };
    const b = { lat: line[i][1], lon: line[i][0] };
    const seg = haversine(a, b);
    while (done + seg >= next && out.length < max) {
      const f = (next - done) / seg;
      out.push({ p: { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }, n: out.length + 1 });
      next += step;
    }
    done += seg;
  }
  return out;
}

/** A GPX 1.1 track for the drawn route. */
export function toGpx(line: [number, number][], name: string): string {
  const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const pts = line.map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="crowfliesdistancecalculator.com" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** "8:03" style pace from seconds. */
export function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Reads "45", "45:30", "1:05:30" as seconds; a bare number is minutes. */
export function parseClock(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 60;
  const parts = s.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p) || p < 0) || parts.length > 3) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
