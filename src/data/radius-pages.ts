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
