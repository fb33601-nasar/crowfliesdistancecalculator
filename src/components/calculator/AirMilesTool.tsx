import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLon } from '../../lib/geo';
import { compass, formatNumber, geodesic, intermediate, formatCoord } from '../../lib/geo';
import Globe from './Globe';
import AirportInput from './AirportInput';
import type { Airport } from './airports';
import { airportByCode, loadAirports, nearestAirport } from './airports';

const MI = 1609.344;
const NM = 1852;
/** Block time model: 30 minutes for taxi, climb and descent, plus cruise at about 500 mph. */
const OVERHEAD_H = 0.5;
const CRUISE_MPH = 500;
const MAX_STOPS = 3;

export const flightHours = (miles: number) => OVERHEAD_H + miles / CRUISE_MPH;

/** Flight times read better in hours, even past a day. */
function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

const EXAMPLES: [string, string][] = [
  ['JFK', 'LHR'],
  ['LAX', 'JFK'],
  ['LHR', 'DXB'],
  ['SFO', 'NRT'],
  ['ORD', 'MIA'],
  ['DXB', 'KHI'],
  ['SYD', 'LAX'],
  ['ATL', 'CDG'],
];

type Unit = 'mi' | 'km' | 'nm';
const UNIT: Record<Unit, { m: number; short: string; long: string }> = {
  mi: { m: MI, short: 'mi', long: 'miles' },
  km: { m: 1000, short: 'km', long: 'kilometers' },
  nm: { m: NM, short: 'nm', long: 'nautical miles' },
};

function tzOffsetMinutes(tz: string, at: Date): number | null {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!part) return null;
    if (part === 'GMT') return 0;
    const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return null;
  }
}

function localTime(tz: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(at);
  } catch {
    return '';
  }
}

function fmtOffset(min: number): string {
  if (min === 0) return 'same time';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const span = `${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m ? `${m} min` : ''}`;
  return min > 0 ? `${span} ahead` : `${span} behind`;
}

export default function AirMilesTool({ initialFrom = 'JFK', initialTo = 'LHR' }: { initialFrom?: string; initialTo?: string }) {
  const [codes, setCodes] = useState<string[]>([initialFrom, initialTo]);
  const [ready, setReady] = useState(false);
  const [unit, setUnit] = useState<Unit>('mi');
  const [round, setRound] = useState(false);
  const [depart, setDepart] = useState('09:00');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get('from')?.toUpperCase();
    const to = q.get('to')?.toUpperCase();
    const via = (q.get('via') ?? '').toUpperCase().split(',').filter((c) => /^[A-Z]{3}$/.test(c)).slice(0, MAX_STOPS);
    if (from && to && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to)) setCodes([from, ...via, to]);
    const u = q.get('unit');
    if (u === 'km' || u === 'nm' || u === 'mi') setUnit(u);
    if (q.get('rt') === '1') setRound(true);
    loadAirports().then(() => setReady(true));
  }, []);

  const points = codes.map((c) => (ready && c ? airportByCode(c) ?? null : null));
  const touchedRef = useRef(false);
  const touched = { set v(x: boolean) { touchedRef.current = x; }, get v() { return touchedRef.current; } };

  useEffect(() => {
    if (!touched.v || !ready) return;
    window.history.replaceState(null, '', `?${query()}`);
  }, [codes, unit, round, ready]);

  function query() {
    const q = new URLSearchParams();
    const set = codes.filter(Boolean);
    if (set.length >= 2) {
      q.set('from', set[0]);
      q.set('to', set[set.length - 1]);
      if (set.length > 2) q.set('via', set.slice(1, -1).join(','));
    }
    if (unit !== 'mi') q.set('unit', unit);
    if (round) q.set('rt', '1');
    return q.toString();
  }

  function setAt(i: number, a: Airport | null) {
    touched.v = true;
    setCodes((cs) => cs.map((c, j) => (j === i ? a?.iata ?? '' : c)));
  }
  function addStop() {
    touched.v = true;
    setCodes((cs) => (cs.length - 2 >= MAX_STOPS ? cs : [...cs.slice(0, -1), '', cs[cs.length - 1]]));
  }
  function removeAt(i: number) {
    touched.v = true;
    setCodes((cs) => cs.filter((_, j) => j !== i));
  }
  function swap() {
    touched.v = true;
    setCodes((cs) => [...cs].reverse());
  }

  const valid = points.filter((p): p is Airport => p !== null);
  const legs = useMemo(() => {
    const out: { a: Airport; b: Airport; m: number; bearing: number; hours: number }[] = [];
    for (let i = 1; i < valid.length; i++) {
      const g = geodesic(valid[i - 1], valid[i]);
      out.push({ a: valid[i - 1], b: valid[i], m: g.distance, bearing: g.initialBearing, hours: flightHours(g.distance / MI) });
    }
    return out;
  }, [valid.map((v) => v.iata).join()]);

  const total = legs.reduce((s, l) => s + l.m, 0);
  const direct = valid.length >= 2 ? geodesic(valid[0], valid[valid.length - 1]).distance : 0;
  const factor = round ? 2 : 1;
  const air = legs.reduce((s, l) => s + l.hours, 0);
  const u = UNIT[unit];
  const fmtD = (m: number) => `${formatNumber(m / u.m, 0)} ${u.short}`;
  const first = valid[0];
  const last = valid[valid.length - 1];

  const now = new Date();
  const offA = first ? tzOffsetMinutes(first.tz, now) : null;
  const offB = last ? tzOffsetMinutes(last.tz, now) : null;
  const diff = offA !== null && offB !== null ? offB - offA : null;

  // Arrival time for a departure at a local clock time, ignoring connection time.
  const [dh, dm] = depart.split(':').map(Number);
  const arrival = (() => {
    if (diff === null || !Number.isFinite(dh)) return null;
    const mins = dh * 60 + (dm || 0) + Math.round(air * 60) + diff;
    const dayShift = Math.floor(mins / 1440);
    const t = ((mins % 1440) + 1440) % 1440;
    const label = new Date(Date.UTC(2000, 0, 1, Math.floor(t / 60), t % 60)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return { label, dayShift };
  })();

  const mid: LatLon | null = legs.length === 1 ? intermediate(legs[0].a, legs[0].b, 0.5) : null;

  async function copy(kind: 'link' | 'result') {
    const text =
      kind === 'link'
        ? `${window.location.origin}${window.location.pathname}?${query()}`
        : `${valid.map((v) => v.iata).join(' – ')}${round ? ' (round trip)' : ''}: ${formatNumber((total * factor) / MI, 0)} miles, ${formatNumber((total * factor) / 1000, 0)} km, ${formatNumber((total * factor) / NM, 0)} nautical miles. Estimated flying time ${formatHours(air * factor)}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  const stops = useMemo(() => valid.slice(1, -1).map((v) => ({ lat: v.lat, lon: v.lon })), [valid.map((v) => v.iata).join()]);

  return (
    <div className="calc calc-air" id="calculator">
      <div className="calc-inputs">
        <form className="calc-form air-form" onSubmit={(e) => e.preventDefault()} aria-label="Air miles calculator">
          {codes.map((c, i) => (
            <AirportInput
              key={`${i}-${codes.length}`}
              letter={i === 0 ? 'A' : i === codes.length - 1 ? 'B' : String(i)}
              label={i === 0 ? 'From airport' : i === codes.length - 1 ? 'To airport' : `Stop ${i}`}
              value={points[i]}
              onChange={(a) => setAt(i, a)}
              onRemove={i > 0 && i < codes.length - 1 ? () => removeAt(i) : undefined}
            />
          ))}
          <div className="air-row-actions">
            <button type="button" onClick={addStop} disabled={codes.length - 2 >= MAX_STOPS}>+ Add a stop</button>
            <button type="button" onClick={swap}>⇅ Swap direction</button>
            <label className="air-check">
              <input type="checkbox" checked={round} onChange={(e) => { touched.v = true; setRound(e.target.checked); }} /> Round trip
            </label>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {legs.length > 0 && first && last ? (
            <>
              <div className="calc-summary">
                <div className="calc-head">
                  <p className="calc-route">
                    {valid.map((v) => v.iata).join(' → ')}
                    {round ? ' and back' : ''}
                  </p>
                  <div className="calc-units" role="radiogroup" aria-label="Units">
                    {(Object.keys(UNIT) as Unit[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={unit === k} onClick={() => { touched.v = true; setUnit(k); }}>
                        {UNIT[k].short}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="calc-distance">
                  <output>{formatNumber((total * factor) / u.m, 0)}</output>
                  <span>{u.long}</span>
                </p>
                <p className="calc-also">
                  <strong>About {formatHours(air * factor)} flying · </strong>
                  {(['mi', 'km', 'nm'] as Unit[]).filter((k) => k !== unit).map((k) => `${formatNumber((total * factor) / UNIT[k].m, 0)} ${UNIT[k].long}`).join(' · ')}
                </p>
              </div>

              <div className="calc-details">
                <table className="air-legs">
                  <caption>{legs.length > 1 ? 'Each leg' : 'The flight'}</caption>
                  <thead>
                    <tr><th scope="col">Leg</th><th scope="col" className="num">Distance</th><th scope="col" className="num">Flying time</th><th scope="col" className="num">Heading</th></tr>
                  </thead>
                  <tbody>
                    {legs.map((l) => (
                      <tr key={`${l.a.iata}-${l.b.iata}`}>
                        <th scope="row">{l.a.iata} → {l.b.iata}</th>
                        <td className="num">{fmtD(l.m)}</td>
                        <td className="num">{formatHours(l.hours)}</td>
                        <td className="num">{Math.round(l.bearing)}° {compass(l.bearing).abbr}</td>
                      </tr>
                    ))}
                    {round && (
                      <tr className="air-total"><th scope="row">Return</th><td className="num">{fmtD(total)}</td><td className="num">{formatHours(air)}</td><td /></tr>
                    )}
                  </tbody>
                </table>
                {legs.length > 1 && (
                  <p className="calc-note">
                    {`The stops add ${fmtD(total - direct)} (${formatNumber(((total - direct) / direct) * 100, 1)}%) to the ${fmtD(direct)} nonstop distance from ${first.iata} to ${last.iata}.`}
                  </p>
                )}

                <dl className="calc-facts air-facts">
                  <div>
                    <dt>Time difference</dt>
                    <dd>{diff === null ? '—' : `${last.city || last.iata} is ${fmtOffset(diff)}`}</dd>
                  </div>
                  <div>
                    <dt>Local time now</dt>
                    <dd>{first.iata} {localTime(first.tz, now)} · {last.iata} {localTime(last.tz, now)}</dd>
                  </div>
                  {mid && (
                    <div>
                      <dt>Halfway point</dt>
                      <dd>{formatCoord(mid, 2)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      <label htmlFor="air-depart">Leave {first.iata} at</label>
                    </dt>
                    <dd className="air-depart">
                      <input id="air-depart" type="time" value={depart} onChange={(e) => setDepart(e.target.value)} />
                      {arrival && (
                        <span>
                          lands about {arrival.label} {last.iata} time
                          {arrival.dayShift > 0 ? ` (+${arrival.dayShift} day)` : arrival.dayShift < 0 ? ' (previous day)' : ''}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="calc-note">
                  Distances are great circle routes on the WGS 84 ellipsoid between airport reference points. Flying times are estimates: 30 minutes for taxi, take-off and landing plus about 500 mph in the air, with no time on the ground at stops.
                </p>

                <div className="calc-actions">
                  <button type="button" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
                  <button type="button" onClick={() => copy('result')}>{copied === 'result' ? 'Result copied' : 'Copy result'}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-empty">
              <p>{ready ? 'Choose two airports to see the air miles between them.' : 'Loading airports…'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="calc-visual">
        <div className="calc-stage">
          <div className="calc-globe">
            <Globe
              a={first ?? null}
              b={last && legs.length ? last : null}
              stops={stops}
              labelA={first?.iata}
              labelB={legs.length ? last?.iata : undefined}
              distanceLabel={legs.length ? fmtD(total) : undefined}
              picking={null}
              onPick={() => undefined}
              cardActions={[
                {
                  label: 'Fly from nearest airport',
                  run: (p) => {
                    const a = nearestAirport(p);
                    if (a) setAt(0, a);
                  },
                },
                {
                  label: 'Fly to nearest airport',
                  run: (p) => {
                    const a = nearestAirport(p);
                    if (a) setAt(codes.length - 1, a);
                  },
                },
              ]}
            />
          </div>
        </div>
        <p className="calc-hint">
          {'The magenta line is the great circle, the shortest path a plane can fly. Drag to turn the globe, scroll or pinch to zoom, click anywhere to fly from or to the nearest airport.'}
        </p>
      </div>

      <div className="calc-examples">
        <span id="examples-label-air">Popular routes</span>
        <ul aria-labelledby="examples-label-air">
          {EXAMPLES.map(([a, b]) => (
            <li key={a + b}>
              <button type="button" onClick={() => { touched.v = true; setCodes([a, b]); }}>
                {a} to {b}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
