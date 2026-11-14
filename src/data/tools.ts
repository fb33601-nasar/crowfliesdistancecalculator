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
  { href: '/zip-code-radius/', name: 'ZIP code radius', blurb: 'List every ZIP code within a radius.', icon: 'target', live: true },
  { href: '/elevation-finder/', name: 'Elevation finder', blurb: 'Height above sea level for any address.', icon: 'compass', live: true },
  { href: '/drive-time-map/', name: 'Drive time map', blurb: 'See how far you can drive in a set time.', icon: 'route', live: true },
  { href: '/mile-radius-from-current-location/', name: 'Mile radius from me', blurb: 'See the towns within any distance of where you are.', icon: 'pin', live: true },
  { href: '/air-miles-calculator/', name: 'Air miles calculator', blurb: 'Flight distance between airports and cities.', icon: 'globe', live: true },
  { href: '/halfway-point-calculator/', name: 'Halfway point', blurb: 'Find the middle between two or more places.', icon: 'pin', live: true },
  { href: '/bearing-calculator/', name: 'Bearing calculator', blurb: 'Compass direction and azimuth between two points.', icon: 'compass', live: true },
  { href: '/distance-between-two-points-calculator/', name: 'Distance between two points', blurb: 'GPS coordinates or x, y points, with the formula.', icon: 'measure', live: true },
  { href: '/how-far-did-i-run/', name: 'How far did I run', blurb: 'Draw your route to measure a run or walk.', icon: 'route', live: true },
  { href: '/walking-time-calculator/', name: 'Walking time calculator', blurb: 'How long a walk takes at your pace, with hills and rests.', icon: 'route', live: true },
  { href: '/miles-to-minutes-calculator/', name: 'Miles to minutes', blurb: 'How long a distance takes to drive, walk or bike.', icon: 'compass', live: true },
];

export const liveTools = () => TOOLS.filter((t) => t.live);
