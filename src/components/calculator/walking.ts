/** Walking paces in mph, with the minutes per mile they work out to. */
export const PACES = [
  { id: 'slow', label: 'Leisurely', mph: 2.5 },
  { id: 'avg', label: 'Average', mph: 3 },
  { id: 'steady', label: 'Steady', mph: 3.5 },
  { id: 'brisk', label: 'Brisk', mph: 4 },
  { id: 'fast', label: 'Power walking', mph: 4.5 },
] as const;
export type PaceId = (typeof PACES)[number]['id'];

/** Naismith's rule: add 30 minutes for every 1,000 ft of climb (1 hour per 600 m). */
export const climbHours = (feet: number) => Math.max(0, feet) / 2000;
/** Rough steps per mile for an average adult stride of about 2.5 ft. */
export const STEPS_PER_MILE = 2100;

export function words(hours: number): string {
  const total = Math.round(hours * 60);
  if (total < 1) return 'under a minute';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hs = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const ms = m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
  return [hs, ms].filter(Boolean).join(' ');
}
export function hm(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
/** Minutes and seconds per mile, e.g. 17:09. */
export const pace = (mph: number) => {
  const s = Math.round(3600 / mph);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Walking hours including a 10-minute rest each full hour. */
export const withBreaks = (h: number) => h + Math.floor(h) * (10 / 60);
