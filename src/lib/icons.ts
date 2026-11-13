// Line icons (24 x 24, stroke) used beside section headings.
const I: Record<string, string> = {
  measure: '<path d="M5 3.5l13 6.2-5.6 1.9-1.9 5.6z"/><path d="M13 13l5.5 5.5"/>',
  meaning: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H14a3 3 0 000-6h-4a3 3 0 010-6h5.8"/>',
  formula: '<path d="M18 5H6.5l6 7-6 7H18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10.5 8v4.5M14.5 8v3M18.5 8v4.5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.8h18M9.5 9.5V20"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.9" fill="currentColor"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  limits: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.2M12 16.9v.1"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.3M12 16.8v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0012 3z"/>',
  bird: '<path d="M3 13.5c3-4 6.5-5 9-2.2 2.5-2.8 6-1.8 9 2.2"/><path d="M8 17.5h8"/>',
};

const BY_SECTION: Record<string, string> = {
  'how-to-measure-distance-as-the-crow-flies': 'measure',
  'what-does-as-the-crow-flies-mean': 'meaning',
  'crow-flies-distance-vs-driving-distance': 'route',
  'how-is-straight-line-distance-calculated': 'formula',
  'why-the-straight-line-looks-curved-on-a-map': 'globe',
  'reading-the-results-heading-halfway-point-and-travel-time': 'compass',
  'miles-kilometers-and-nautical-miles': 'ruler',
  'popular-distances-as-the-crow-flies': 'table',
  'what-people-use-straight-line-distance-for': 'target',
  'how-to-measure-as-the-crow-flies-on-google-maps': 'pin',
  'limits-of-a-straight-line-measurement': 'limits',
  'frequently-asked-questions': 'question',
};

export function icon(name: string): string {
  return I[name] ?? I.bird;
}

export function sectionIcon(id: string | undefined): string {
  return icon(BY_SECTION[id ?? ''] ?? 'bird');
}
