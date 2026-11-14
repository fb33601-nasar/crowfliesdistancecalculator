/** Distances that get their own "N mile radius from me" page, chosen from search demand. */
export const RADIUS_MILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 60, 75, 100, 150, 200, 250, 300, 500, 1000];
export const RADIUS_DATE = '2026-11-14';
export const radiusSlug = (n: number) => `/${n}-mile-radius-from-me/`;

/** Places to compare a circle's area with. Land area for cities, total area for states and countries, in square miles. */
export const AREA_REFS: [name: string, sqmi: number][] = [
  ['Manhattan', 22.8],
  ['San Francisco', 46.9],
  ['Washington, D.C.', 61.1],
  ['New York City', 302.6],
  ['the city of Los Angeles', 469.5],
  ['Rhode Island', 1545],
  ['Delaware', 2489],
  ['Connecticut', 5543],
  ['New Jersey', 8723],
  ['Massachusetts', 10554],
  ['Maryland', 12406],
  ['West Virginia', 24230],
  ['South Carolina', 32020],
  ['Indiana', 36420],
  ['Ohio', 44826],
  ['England', 50301],
  ['New York State', 54555],
  ['Florida', 65758],
  ['the United Kingdom', 94354],
  ['Colorado', 104094],
  ['California', 163695],
  ['Texas', 268596],
  ['Alaska', 665384],
  ['the contiguous United States', 3119885],
];

/** Travel-time pages: hours get "N hour radius from me", minutes get "N minute radius map". */
export const RADIUS_HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const RADIUS_MINUTES = [15, 20, 30, 45];
export const hourSlug = (n: number) => `/${n}-hour-radius-from-me/`;
export const minuteSlug = (n: number) => `/${n}-minute-radius-map/`;
export const RADIUS_KM = [3, 5, 10, 20, 25, 30, 40, 50];
export const kmSlug = (n: number) => `/${n}-km-radius-from-my-location/`;

/** Average driving speed (mph) used for a trip of this length; longer trips use more fast road. */
export const driveMph = (minutes: number) => (minutes <= 30 ? 30 : minutes <= 60 ? 40 : minutes <= 120 ? 50 : 60);
export const DETOUR = 1.19;

export const US_CITIES: [string, number, number][] = [
  ['New York', 40.7128, -74.006],
  ['Los Angeles', 34.0522, -118.2437],
  ['Chicago', 41.85, -87.65],
  ['Houston', 29.7633, -95.3633],
  ['Phoenix', 33.4484, -112.074],
  ['Atlanta', 33.749, -84.388],
  ['Denver', 39.7392, -104.9903],
  ['Seattle', 47.6062, -122.3321],
  ['Dallas', 32.7831, -96.8067],
];

/** "How many minutes is N miles" pages, chosen from search demand. */
export const MINUTE_MILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 32, 40, 50, 100, 150, 200, 300];
export const minutesSlug = (n: number) => `/how-many-minutes-is-${n}-${n === 1 ? 'mile' : 'miles'}/`;
