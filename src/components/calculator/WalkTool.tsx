import { useEffect, useState } from 'react';
import { formatNumber } from '../../lib/geo';
import { PACES, type PaceId, climbHours, STEPS_PER_MILE, hm, pace, withBreaks } from './walking';

type Unit = 'mi' | 'km';
const KM_PER_MI = 1.609344;

function clockAt(start: string, hours: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]) + Math.round(hours * 60);
  const day = Math.floor(mins / 1440);
  const t = mins % 1440;
  const h = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, '0');
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${ampm}${day ? ` (+${day} day${day > 1 ? 's' : ''})` : ''}`;
}

export default function WalkTool({ initialMiles = 3 }: { initialMiles?: number }) {
  const [unit, setUnit] = useState<Unit>('mi');
  const [distText, setDistText] = useState(String(initialMiles));
  const [paceId, setPaceId] = useState<PaceId | 'custom'>('avg');
  const [customPace, setCustomPace] = useState('');
  const [climbText, setClimbText] = useState('');
  const [breaks, setBreaks] = useState(initialMiles >= 6);
  const [start, setStart] = useState('08:00');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('d')) setDistText(q.get('d')!.slice(0, 10));
    if (q.get('unit') === 'km') setUnit('km');
    const p = q.get('pace');
    if (p && PACES.some((x) => x.id === p)) setPaceId(p as PaceId);
  }, []);

  const dist = Number(distText.replace(/,/g, ''));
  const miles = unit === 'mi' ? dist : dist / KM_PER_MI;
  const ok = Number.isFinite(dist) && dist > 0 && dist < 10000;
  // Custom pace is minutes per mile (or per km), e.g. 18 or 18:30.
  const cp = /^(\d{1,2})(?::(\d{2}))?$/.exec(customPace.trim());
  const customMinPerUnit = cp ? Number(cp[1]) + Number(cp[2] ?? 0) / 60 : NaN;
  const customMph = customMinPerUnit > 0 ? (60 / customMinPerUnit) / (unit === 'mi' ? 1 : KM_PER_MI) : NaN;
  const mph = paceId === 'custom' ? customMph : PACES.find((p) => p.id === paceId)!.mph;
  const climbFt = Number(climbText) > 0 ? (unit === 'mi' ? Number(climbText) : Number(climbText) * 3.28084) : 0;
  const okMph = Number.isFinite(mph) && mph > 0.5 && mph < 8;

  const moving = ok && okMph ? miles / mph + climbHours(climbFt) : 0;
  const total = breaks ? withBreaks(moving) : moving;
  const finish = clockAt(start, total);

  useEffect(() => {
    const q = new URLSearchParams();
    if (ok) q.set('d', distText);
    if (unit === 'km') q.set('unit', 'km');
    if (paceId !== 'avg' && paceId !== 'custom') q.set('pace', paceId);
    const s = q.toString();
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
  }, [distText, unit, paceId]);

  const per = unit === 'mi' ? 'mi' : 'km';
  const paceFor = (m: number) => pace(unit === 'mi' ? m : m * KM_PER_MI);

  return (
    <div className="calc calc-minutes calc-walk" id="calculator">
      <div className="minutes-wrap">
        <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-label="Walking time calculator">
          <div className="radius-row">
            <label htmlFor="wk-dist">Distance</label>
            <div className="radius-inputs">
              <input id="wk-dist" type="text" inputMode="decimal" autoComplete="off" value={distText} onChange={(e) => setDistText(e.target.value)} aria-invalid={distText !== '' && !ok} />
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
                <option value="mi">miles</option>
                <option value="km">kilometers</option>
              </select>
            </div>
            <div className="radius-presets" role="group" aria-label="Common distances">
              {[1, 3, 5, 10, 13.1, 20, 26.2].map((v) => (
                <button key={v} type="button" aria-pressed={dist === v} onClick={() => setDistText(String(v))}>
                  {v} {unit}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="radius-row walk-paces">
            <legend>Walking pace</legend>
            <div className="walk-pace-list" role="radiogroup" aria-label="Walking pace">
              {PACES.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={paceId === p.id} onClick={() => setPaceId(p.id)}>
                  <span>{p.label}</span>
                  <small>{unit === 'mi' ? `${p.mph} mph` : `${formatNumber(p.mph * KM_PER_MI, 1)} km/h`} · {paceFor(p.mph)} /{per}</small>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={paceId === 'custom'} onClick={() => setPaceId('custom')}>
                <span>My own pace</span>
                <small>minutes per {per === 'mi' ? 'mile' : 'km'}</small>
              </button>
            </div>
            {paceId === 'custom' && (
              <div className="radius-inputs">
                <input id="wk-pace" type="text" inputMode="numeric" autoComplete="off" placeholder="e.g. 18:30" aria-label={`Your pace in minutes per ${per === 'mi' ? 'mile' : 'kilometer'}`} value={customPace} onChange={(e) => setCustomPace(e.target.value)} aria-invalid={customPace !== '' && !okMph} />
                <span className="minutes-unit">min /{per}</span>
              </div>
            )}
          </fieldset>

          <div className="radius-row">
            <label htmlFor="wk-climb">Total climb (optional)</label>
            <div className="radius-inputs">
              <input id="wk-climb" type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={climbText} onChange={(e) => setClimbText(e.target.value)} />
              <span className="minutes-unit">{unit === 'mi' ? 'feet' : 'meters'}</span>
            </div>
          </div>

          <div className="walk-extras">
            <label className="check">
              <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} /> Add a 10-minute rest every hour
            </label>
            <label className="walk-start">
              Start at <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
          </div>
        </form>

        <div className="calc-result" aria-live="polite">
          {ok && okMph ? (
            <>
              <div className="calc-summary">
                <p className="calc-route">Walking {formatNumber(dist, dist % 1 ? 1 : 0)} {unit === 'mi' ? (dist === 1 ? 'mile' : 'miles') : 'kilometers'} takes about</p>
                <p className="calc-distance"><output>{hm(total)}</output></p>
                <p className="calc-also">
                  <strong>at {unit === 'mi' ? `${formatNumber(mph, 1)} mph` : `${formatNumber(mph * KM_PER_MI, 1)} km/h`}, {paceFor(mph)} per {per === 'mi' ? 'mile' : 'km'}</strong>
                  {finish && <> · finish around {finish}</>}
                </p>
              </div>
              <div className="calc-details">
                <dl className="walk-breakdown">
                  <div><dt>Moving time</dt><dd>{hm(miles / mph)}</dd></div>
                  {climbFt > 0 && <div><dt>Extra for the climb</dt><dd>+{hm(climbHours(climbFt))}</dd></div>}
                  {breaks && total > moving && <div><dt>Rest stops</dt><dd>+{hm(total - moving)}</dd></div>}
                  <div><dt>Steps, roughly</dt><dd>{formatNumber(Math.round((miles * STEPS_PER_MILE) / 100) * 100, 0)}</dd></div>
                </dl>
                <table className="air-legs minutes-table">
                  <caption>Same distance at other paces</caption>
                  <thead><tr><th scope="col">Pace</th><th scope="col" className="num">Speed</th><th scope="col" className="num">Per {per === 'mi' ? 'mile' : 'km'}</th><th scope="col" className="num">Time</th></tr></thead>
                  <tbody>
                    {PACES.map((p) => {
                      const t = miles / p.mph + climbHours(climbFt);
                      return (
                        <tr key={p.id} className={p.id === paceId ? 'is-highlight' : undefined}>
                          <th scope="row">{p.label}</th>
                          <td className="num">{unit === 'mi' ? `${p.mph} mph` : `${formatNumber(p.mph * KM_PER_MI, 1)} km/h`}</td>
                          <td className="num">{paceFor(p.mph)}</td>
                          <td className="num">{hm(breaks ? withBreaks(t) : t)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="calc-note">Climb time uses Naismith's rule: an extra 30 minutes per 1,000 ft (about 1 hour per 600 m). Steps assume an average adult stride; yours may differ by 20% either way.</p>
              </div>
            </>
          ) : (
            <div className="calc-empty"><p>{ok ? 'Enter your pace as minutes per mile, like 18 or 18:30.' : 'Enter a distance to see how long it takes to walk.'}</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
