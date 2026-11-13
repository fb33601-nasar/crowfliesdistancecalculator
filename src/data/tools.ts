// Every tool page on the site. Only pages marked live are linked anywhere.
export interface Tool {
  href: string;
  name: string;
  /** one line on what it does, shown in menus and related-tool cards */
  blurb: string;
  icon: string;
  live: boolean;
}

export const TOOLS: Tool[] = [
  {
    href: '/',
    name: 'As the crow flies distance calculator',
    blurb: 'Straight line distance between any two places, with heading and halfway point.',
    icon: 'bird',
    live: true,
  },
  {
    href: '/distance-between-two-addresses/',
    name: 'Distance between two addresses',
    blurb: 'Driving, walking, cycling and straight line distance, with travel times.',
    icon: 'route',
    live: true,
  },
  { href: '/radius-map/', name: 'Radius map', blurb: 'Draw a circle of any radius around a place.', icon: 'target', live: true },
  { href: '/mile-radius-from-me/', name: 'Mile radius from me', blurb: 'See everything within a set distance of where you are.', icon: 'pin', live: false },
  { href: '/air-miles-calculator/', name: 'Air miles calculator', blurb: 'Flight distance between airports and cities.', icon: 'globe', live: false },
  { href: '/halfway-point/', name: 'Halfway point', blurb: 'The exact midpoint between two places.', icon: 'compass', live: false },
];

export const liveTools = () => TOOLS.filter((t) => t.live);
