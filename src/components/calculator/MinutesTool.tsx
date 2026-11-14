import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../../lib/geo';

type Unit = 'mi' | 'km';
type Dir = 'time' | 'distance';
const KM_PER_MI = 1.609344;

export interface Mode {
  id: string;
  label: string;
  mph: number;
  group: 'drive' | 'other';
}
export const MODES: Mode[] = [
  { id: 'walk', label: 'Walking', mph: 3, group: 'other' },
  { id: 'brisk', label: 'Brisk walking', mph: 4, group: 'other' },
  { id: 'run', label: 'Running', mph: 6, group: 'other' },
  { id: 'bike', label: 'Cycling', mph: 12, group: 'other' },
  { id: 'city', label: 'Driving in city traffic', mph: 20, group: 'drive' },
  { id: 'town', label: 'Driving in town', mph: 30, group: 'drive' },
  { id: 'mixed', label: 'Driving on mixed roads', mph: 40, group: 'drive' },
  { id: 'rural', label: 'Driving on rural roads', mph: 50, group: 'drive' },
  { id: 'highway', label: 'Driving on the highway', mph: 60, group: 'drive' },
  { id: 'interstate', label: 'Open interstate or motorway', mph: 70, group: 'drive' },
];

/** Typical door-to-door driving speeds for a trip of this length, in mph. */
export function typicalDrive(miles: number): [number, number] {
  if (miles < 10) return [20, 30];
  if (miles <= 25) return [30, 40];
  if (miles <= 60) return [40, 55];
  return [50, 60];
}

export function hm(hours: number): string {
  const total = Math.round(hours * 60);
  if (total < 1) return 'under 1 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Prose duration: "3 hours 20 minutes", "50 minutes". */
export function words(hours: number): string {
  const total = Math.round(hours * 60);
  if (total < 1) return 'under a minute';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hs = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const ms = m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
  return [hs, ms].filter(Boolean).join(' ');
}

/** Prose range: "15 to 20 minutes", "5 to 6 hours", "1 hour 40 minutes to 2 hours". */
export function wordsRange(a: number, b: number): string {
  const ta = Math.round(a * 60);
  const tb = Math.round(b * 60);
  if (ta === tb) return words(a);
  if (tb < 60) return `${ta} to ${tb} minutes`;
  if (ta % 60 === 0 && tb % 60 === 0) return `${ta / 60} to ${tb / 60} hours`;
  return `${words(a)} to ${words(b)}`;
}

export default function MinutesTool({ initialMiles = 10, initialUnit = 'mi' }: { initialMiles?: number; initialUnit?: Unit }) {
  const [dir, setDir] = useState<Dir>('time');
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [distText, setDistText] = useState(String(initialMiles));
  const [minText, setMinText] = useState('30');
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('d')) setDistText(q.get('d')!.slice(0, 10));
    if (q.get('unit') === 'km') setUnit('km');
    if (q.get('min')) {
      setDir('distance');
      setMinText(q.get('min')!.slice(0, 10));
    }
    if (q.get('speed')) setCustomText(q.get('speed')!.slice(0, 6));
  }, []);

  const dist = Number(distText.replace(/,/g, ''));
  const miles = unit === 'mi' ? dist : dist / KM_PER_MI;
  const minutes = Number(minText.replace(/,/g, ''));
  const custom = Number(customText);
  const okDist = Number.isFinite(dist) && dist > 0 && dist < 100000;
  const okMin = Number.isFinite(minutes) && minutes > 0 && minutes < 100000;
  const speedUnit = unit === 'mi' ? 'mph' : 'km/h';
  const toUnitSpeed = (mph: number) => (unit === 'mi' ? mph : mph * KM_PER_MI);
  const fmtDist = (mi: number) => {
    const v = unit === 'mi' ? mi : mi * KM_PER_MI;
    return `${formatNumber(v, v < 10 ? 1 : 0)} ${unit}`;
  };

  const rows = useMemo(() => {
    const list = [...MODES];
    if (custom > 0 && custom < 1000) list.push({ id: 'custom', label: 'Your speed', mph: unit === 'mi' ? custom : custom / KM_PER_MI, group: 'drive' });
    return list;
  }, [custom, unit]);

  const [lo, hi] = typicalDrive(miles);

  useEffect(() => {
    const q = new URLSearchParams();
    if (dir === 'time') {
      if (okDist) q.set('d', distText);
    } else if (okMin) q.set('min', minText);
    if (unit === 'km') q.set('unit', 'km');
    if (custom > 0) q.set('speed', customText);
    const s = q.toString();
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
  }, [dir, distText, minText, unit, customText]);

  return (
    <div className="calc calc-minutes" id="calculator">
      <div className="minutes-wrap">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Miles to minutes calculator">
          <div className="nearme-modes" role="radiogroup" aria-label="What to work out">
            <button type="button" role="radio" aria-checked={dir === 'time'} onClick={() => setDir('time')}>Distance → time</button>
            <button type="button" role="radio" aria-checked={dir === 'distance'} onClick={() => setDir('distance')}>Time → distance</button>
          </div>
          {dir === 'time' ? (
            <div className="radius-row">
              <label htmlFor="mt-dist">Distance</label>
              <div className="radius-inputs">
                <input id="mt-dist" type="text" inputMode="decimal" autoComplete="off" value={distText} onChange={(e) => setDistText(e.target.value)} aria-invalid={distText !== '' && !okDist} />
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
                  <option value="mi">miles</option>
                  <option value="km">kilometers</option>
                </select>
              </div>
              <div className="radius-presets" role="group" aria-label="Common distances">
                {[1, 5, 10, 20, 25, 50, 100].map((v) => (
                  <button key={v} type="button" aria-pressed={dist === v} onClick={() => setDistText(String(v))}>
                    {v} {unit}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="radius-row">
              <label htmlFor="mt-min">Travel time, in minutes</label>
              <div className="radius-inputs">
                <input id="mt-min" type="text" inputMode="decimal" autoComplete="off" value={minText} onChange={(e) => setMinText(e.target.value)} aria-invalid={minText !== '' && !okMin} />
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Show distance in">
                  <option value="mi">miles</option>
                  <option value="km">kilometers</option>
                </select>
              </div>
              <div className="radius-presets" role="group" aria-label="Common times">
                {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                  <button key={v} type="button" aria-pressed={minutes === v} onClick={() => setMinText(String(v))}>
                    {v < 60 ? `${v} min` : `${v / 60} h`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="radius-row">
            <label htmlFor="mt-speed">Your own speed (optional)</label>
            <div className="radius-inputs">
              <input id="mt-speed" type="text" inputMode="decimal" autoComplete="off" placeholder={unit === 'mi' ? 'e.g. 45' : 'e.g. 70'} value={customText} onChange={(e) => setCustomText(e.target.value)} />
              <span className="minutes-unit">{speedUnit}</span>
            </div>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {dir === 'time' && okDist ? (
            <>
              <div className="calc-summary">
                <p className="calc-route">{formatNumber(dist, dist % 1 ? 1 : 0)} {unit === 'mi' ? (dist === 1 ? 'mile' : 'miles') : 'kilometers'} by car takes about</p>
                <p className="calc-distance">
                  <output>{Math.round((miles / lo) * 60) < 60 && Math.round((miles / hi) * 60) !== Math.round((miles / lo) * 60) ? `${Math.round((miles / hi) * 60)}–${Math.round((miles / lo) * 60)} min` : hm(miles / lo) !== hm(miles / hi) ? `${hm(miles / hi)} – ${hm(miles / lo)}` : hm(miles / hi)}</output>
                </p>
                <p className="calc-also">
                  <strong>
                    at {formatNumber(toUnitSpeed(lo), 0)}–{formatNumber(toUnitSpeed(hi), 0)} {speedUnit}, typical for a trip this long ·{' '}
                  </strong>
                  {hm(miles / 60)} at a steady {formatNumber(toUnitSpeed(60), 0)} {speedUnit}
                </p>
              </div>
              <div className="calc-details">
                <table className="air-legs minutes-table">
                  <caption>Time by speed</caption>
                  <thead>
                    <tr><th scope="col">How you travel</th><th scope="col" className="num">Speed</th><th scope="col" className="num">Time</th><th scope="col" className="num">Minutes</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className={m.id === 'custom' ? 'is-highlight' : undefined}>
                        <th scope="row">{m.label}</th>
                        <td className="num">{formatNumber(toUnitSpeed(m.mph), 0)} {speedUnit}</td>
                        <td className="num">{hm(miles / m.mph)}</td>
                        <td className="num">{formatNumber((miles / m.mph) * 60, (miles / m.mph) * 60 < 10 ? 1 : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="calc-note">Moving time at a steady average speed, with no stops. Real trips add time for lights, junctions, parking and traffic.</p>
              </div>
            </>
          ) : dir === 'distance' && okMin ? (
            <>
              <div className="calc-summary">
                <p className="calc-route">In {hm(minutes / 60)} by car you can cover about</p>
                <p className="calc-distance">
                  <output>{fmtDist((minutes / 60) * typicalDrive((minutes / 60) * 45)[0])} – {fmtDist((minutes / 60) * typicalDrive((minutes / 60) * 45)[1])}</output>
                </p>
                <p className="calc-also">
                  <strong>of road, at typical average speeds · </strong>
                  {fmtDist((minutes / 60) * 60)} at a steady {formatNumber(toUnitSpeed(60), 0)} {speedUnit}
                </p>
              </div>
              <div className="calc-details">
                <table className="air-legs minutes-table">
                  <caption>Distance by speed</caption>
                  <thead>
                    <tr><th scope="col">How you travel</th><th scope="col" className="num">Speed</th><th scope="col" className="num">Distance</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className={m.id === 'custom' ? 'is-highlight' : undefined}>
                        <th scope="row">{m.label}</th>
                        <td className="num">{formatNumber(toUnitSpeed(m.mph), 0)} {speedUnit}</td>
                        <td className="num">{fmtDist((minutes / 60) * m.mph)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="calc-note">Distance along the road or path. To see how far that reaches in a straight line from you, use the <a href="/mile-radius-from-current-location/">mile radius from current location</a> tool.</p>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>Enter a distance or a time to see the conversion.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
