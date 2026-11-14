import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon, Place } from '../../lib/geo';
import { compass, formatNumber, haversine, sphericalBearing } from '../../lib/geo';
import PlaceInput from './PlaceInput';
import type { RadiusMapHandle } from './RadiusMapView';

const RadiusMapView = lazy(() => import('./RadiusMapView'));

type Unit = 'mi' | 'km';
const M: Record<Unit, number> = { mi: 1609.344, km: 1000 };
type Row = [zip: string, place: string, state: string, county: string, lat: number, lon: number];
interface Zip extends LatLon {
  zip: string;
  place: string;
  state: string;
  county: string;
}

let zipsPromise: Promise<Zip[]> | null = null;
export function loadZips(): Promise<Zip[]> {
  zipsPromise ??= fetch('/data/zips.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: Row[]) => rows.map((r) => ({ zip: r[0], place: r[1], state: r[2], county: r[3], lat: r[4], lon: r[5] })))
    .catch(() => []);
  return zipsPromise;
}

const PRESETS = [5, 10, 15, 25, 50, 100];
const LIST_LIMIT = 500;

export default function ZipRadiusTool({ initialZip = '10001', initialRadius = 10 }: { initialZip?: string; initialRadius?: number }) {
  const [zips, setZips] = useState<Zip[]>([]);
  const [zipText, setZipText] = useState(initialZip);
  const [place, setPlace] = useState<Place | null>(null);
  const [radiusText, setRadiusText] = useState(String(initialRadius));
  const [unit, setUnit] = useState<Unit>('mi');
  const [sort, setSort] = useState<'distance' | 'zip'>('distance');
  const [checkText, setCheckText] = useState('');
  const [copied, setCopied] = useState('');
  const mapRef = useRef<RadiusMapHandle>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('zip') && /^\d{5}$/.test(q.get('zip')!)) setZipText(q.get('zip')!);
    if (q.get('r')) setRadiusText(q.get('r')!.slice(0, 6));
    if (q.get('unit') === 'km') setUnit('km');
    loadZips().then(setZips);
  }, []);

  const byZip = useMemo(() => new Map(zips.map((z) => [z.zip, z])), [zips]);
  const zipMatch = /^\d{5}$/.test(zipText.trim()) ? byZip.get(zipText.trim()) ?? null : null;
  const center: (LatLon & { label: string }) | null = place
    ? { lat: place.lat, lon: place.lon, label: place.name.split(',')[0] }
    : zipMatch
      ? { lat: zipMatch.lat, lon: zipMatch.lon, label: `${zipMatch.zip} ${zipMatch.place}, ${zipMatch.state}` }
      : null;
  const radiusVal = Number(radiusText.replace(/,/g, ''));
  const radius = Number.isFinite(radiusVal) && radiusVal > 0 ? Math.min(radiusVal, 500) * M[unit] : 0;

  useEffect(() => {
    const q = new URLSearchParams();
    if (zipMatch && !place) q.set('zip', zipMatch.zip);
    if (radiusText) q.set('r', radiusText);
    if (unit === 'km') q.set('unit', 'km');
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [zipMatch?.zip, place, radiusText, unit]);

  const found = useMemo(() => {
    if (!center || !radius || !zips.length) return [];
    const latSpan = radius / 111_000 + 0.05;
    const out: (Zip & { d: number; b: number })[] = [];
    for (const z of zips) {
      if (Math.abs(z.lat - center.lat) > latSpan) continue;
      const d = haversine(center, z);
      if (d <= radius) out.push({ ...z, d, b: sphericalBearing(center, z) });
    }
    return out.sort((x, y) => x.d - y.d);
  }, [center?.lat, center?.lon, radius, zips]);

  const sorted = useMemo(() => (sort === 'zip' ? [...found].sort((a, b) => a.zip.localeCompare(b.zip)) : found), [found, sort]);
  const places = useMemo(() => new Set(found.map((z) => `${z.place}, ${z.state}`)).size, [found]);
  const counties = useMemo(() => new Set(found.map((z) => `${z.county}, ${z.state}`)).size, [found]);
  const states = useMemo(() => [...new Set(found.map((z) => z.state))], [found]);

  const check = /^\d{5}$/.test(checkText.trim()) ? byZip.get(checkText.trim()) : undefined;
  const checkDist = check && center ? haversine(center, check) : null;

  const fd = (m: number) => `${formatNumber(m / M[unit], m / M[unit] < 10 ? 1 : 0)} ${unit}`;

  async function copy(text: string, kind: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
  function csv() {
    const head = `zip,place,state,county,distance_${unit},direction,latitude,longitude`;
    const body = sorted.map((z) => [z.zip, `"${z.place}"`, z.state, `"${z.county}"`, (z.d / M[unit]).toFixed(2), compass(z.b).abbr, z.lat, z.lon].join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`${head}\n${body}\n`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `zip-codes-within-${radiusText}-${unit}-of-${zipMatch?.zip ?? 'point'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const mapCircles = center && radius ? [{ id: 'z', center, radius, color: '#c4157a', selected: true, label: `${radiusText} ${unit} radius` }] : [];
  const points = useMemo(() => {
    if (!center || !radius) return [];
    const span = (radius * 1.5) / 111_000 + 0.05;
    return zips
      .filter((z) => Math.abs(z.lat - center.lat) < span && Math.abs(z.lon - center.lon) < span / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))
      .slice(0, 3000)
      .map((z) => ({ lat: z.lat, lon: z.lon, label: z.zip, inside: haversine(center, z) <= radius }));
  }, [center?.lat, center?.lon, radius, zips]);

  return (
    <div className="calc calc-radius calc-zip" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="ZIP code radius search">
          <div className="radius-row">
            <label htmlFor="zip-in">Center ZIP code</label>
            <div className="radius-inputs">
              <input
                id="zip-in"
                type="text"
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
                value={zipText}
                onChange={(e) => {
                  setZipText(e.target.value.replace(/\D/g, ''));
                  setPlace(null);
                }}
                aria-invalid={zipText.length === 5 && zips.length > 0 && !zipMatch}
                aria-describedby="zip-hint"
              />
            </div>
            <small id="zip-hint" className="zip-hint">
              {!zips.length ? 'Loading ZIP codes…' : zipMatch ? `${zipMatch.place}, ${zipMatch.state} · ${zipMatch.county} County` : zipText.length === 5 ? 'ZIP code not found' : 'Enter a five-digit US ZIP code'}
            </small>
          </div>
          <PlaceInput letter="●" label="Or center on an address" placeholder="Street address, city or landmark" value={place} onChange={setPlace} />
          <div className="radius-row">
            <label htmlFor="zip-r">Radius</label>
            <div className="radius-inputs">
              <input id="zip-r" type="text" inputMode="decimal" value={radiusText} onChange={(e) => setRadiusText(e.target.value)} />
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
                <option value="mi">miles</option>
                <option value="km">kilometers</option>
              </select>
            </div>
            <div className="radius-presets" role="group" aria-label="Common radii">
              {PRESETS.map((v) => (
                <button key={v} type="button" aria-pressed={radiusVal === v} onClick={() => setRadiusText(String(v))}>
                  {v} {unit}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {center && radius ? (
            <>
              <div className="calc-summary">
                <p className="calc-route">{`ZIP codes within ${radiusText} ${unit === 'mi' ? 'miles' : 'km'} of ${center.label}`}</p>
                <p className="calc-distance">
                  <output>{zips.length ? formatNumber(found.length, 0) : '…'}</output>
                  <span>ZIP codes</span>
                </p>
                <p className="calc-also">
                  <strong>{formatNumber(places, 0)} {places === 1 ? 'place' : 'places'} · {formatNumber(counties, 0)} {counties === 1 ? 'county' : 'counties'}</strong>
                  {states.length > 0 && ` · ${states.length === 1 ? states[0] : `${states.length} states: ${states.slice(0, 6).join(', ')}${states.length > 6 ? '…' : ''}`}`}
                </p>
              </div>
              <div className="calc-details">
                <div className="zip-actions">
                  <button type="button" onClick={() => copy(sorted.map((z) => z.zip).join(', '), 'list')} disabled={!found.length}>
                    {copied === 'list' ? 'Copied' : 'Copy ZIP list'}
                  </button>
                  <button type="button" onClick={csv} disabled={!found.length}>Download CSV</button>
                  <button type="button" onClick={() => copy(window.location.href, 'link')}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
                  <label className="zip-sort">
                    Sort by{' '}
                    <select value={sort} onChange={(e) => setSort(e.target.value as 'distance' | 'zip')}>
                      <option value="distance">distance</option>
                      <option value="zip">ZIP code</option>
                    </select>
                  </label>
                </div>
                <div className="zip-table-wrap">
                  <table className="air-legs zip-table">
                    <thead>
                      <tr><th scope="col">ZIP</th><th scope="col">Place</th><th scope="col" className="num">Distance</th></tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, LIST_LIMIT).map((z) => (
                        <tr key={z.zip}>
                          <th scope="row">{z.zip}</th>
                          <td>{z.place}, {z.state}</td>
                          <td className="num">{fd(z.d)} {z.d > 200 ? compass(z.b).abbr : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sorted.length > LIST_LIMIT && <p className="calc-note">{`Showing the first ${LIST_LIMIT} of ${formatNumber(sorted.length, 0)}. Copy or download to get them all.`}</p>}
                <div className="zip-check">
                  <label htmlFor="zip-check">Is this ZIP inside the radius?</label>
                  <input id="zip-check" type="text" inputMode="numeric" maxLength={5} placeholder="e.g. 10601" value={checkText} onChange={(e) => setCheckText(e.target.value.replace(/\D/g, ''))} />
                  {check && checkDist !== null && (
                    <p className={`radius-verdict ${checkDist <= radius ? 'is-in' : 'is-out'}`}>
                      <strong>{checkDist <= radius ? 'Inside' : 'Outside'}</strong>{' '}
                      {`${check.zip} (${check.place}, ${check.state}) is ${fd(checkDist)} ${compass(sphericalBearing(center, check)).abbr} of the center.`}
                    </p>
                  )}
                  {checkText.length === 5 && zips.length > 0 && !check && <p className="calc-note">That ZIP code is not in the list.</p>}
                </div>
                <p className="calc-note">Distances are straight lines between ZIP code center points from GeoNames (CC BY 4.0). A ZIP code counts as inside when its center is.</p>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>{zips.length ? 'Enter a ZIP code or an address and a radius.' : 'Loading ZIP codes…'}</p></div>
          )}
        </div>
      </div>
      <div className="calc-visual">
        <div className="calc-stage">
          <div className="calc-map">
            <Suspense fallback={<p className="map-status">Loading the map…</p>}>
              <RadiusMapView
                ref={mapRef}
                circles={mapCircles}
                probe={check && checkDist !== null ? { lat: check.lat, lon: check.lon, inside: checkDist <= radius } : null}
                imperial={unit === 'mi'}
                picking={false}
                visible={true}
                points={points}
                onPick={() => undefined}
                onMoveCenter={(_id, p) => setPlace({ ...p, name: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` })}
                onResize={(_id, r) => setRadiusText(String(Number((r / M[unit]).toFixed(1))))}
                onSelect={() => undefined}
              />
            </Suspense>
          </div>
        </div>
        <p className="calc-hint">Dark dots are ZIP code centers inside the radius. Drag the center or the white handle to change the search; zoom in to read ZIP labels.</p>
      </div>
    </div>
  );
}
