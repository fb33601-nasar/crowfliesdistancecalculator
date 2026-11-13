// Routes captured from the FOSSGIS OSRM server (OpenStreetMap data) on 14 November 2026.
// distance in metres, duration in seconds, free-flowing traffic.
import { C } from './routes';
import type { Place } from '../lib/geo';

const p = (name: string, lat: number, lon: number): Place => ({ name, lat, lon });

export const SAMPLED_ON = '2026-11-14';

export interface ModeSample {
  a: Place;
  b: Place;
  car: [number, number];
  foot: [number, number];
  bike: [number, number];
}

export const ADDRESS_SAMPLES: ModeSample[] = [
  { a: p('Empire State Building', 40.7484, -73.9857), b: p('One World Trade Center', 40.7127, -74.0134), car: [6259, 817], foot: [4858, 3886], bike: [5452, 1591] },
  { a: p('Buckingham Palace', 51.5014, -0.1419), b: p('Tower of London', 51.5081, -0.0759), car: [5632, 922], foot: [5386, 4309], bike: [5280, 2100] },
  { a: p('The White House', 38.8977, -77.0365), b: p('Lincoln Memorial', 38.8893, -77.0502), car: [4330, 490], foot: [2051, 1641], bike: [2133, 768] },
  { a: p('Willis Tower', 41.8789, -87.6359), b: p('Wrigley Field', 41.9484, -87.6553), car: [8642, 737], foot: [8926, 7139], bike: [8425, 2193] },
  { a: p('Space Needle', 47.6205, -122.3493), b: p('Pike Place Market', 47.6097, -122.3422), car: [1731, 244], foot: [1657, 1326], bike: [1706, 484] },
  { a: p('Manchester Piccadilly', 53.4774, -2.2309), b: p('Old Trafford', 53.4631, -2.2913), car: [6879, 759], foot: [5302, 4242], bike: [5835, 1552] },
];

const extra = {
  philadelphia: p('Philadelphia', 39.9523, -75.1638),
  oakland: p('Oakland', 37.8044, -122.2711),
  detroit: p('Detroit', 42.3314, -83.0458),
  portland: p('Portland', 45.5234, -122.6762),
  orlando: p('Orlando', 28.5383, -81.3792),
  saltLake: p('Salt Lake City', 40.7608, -111.891),
  southampton: p('Southampton', 50.9039, -1.4043),
  inverness: p('Inverness', 57.4791, -4.224),
};

export interface CarSample {
  a: Place;
  b: Place;
  /** [metres, seconds] */
  car: [number, number];
  region: 'US' | 'UK';
}

export const CITY_SAMPLES: CarSample[] = [
  { a: C.newYork, b: extra.philadelphia, car: [151461, 7481], region: 'US' },
  { a: C.newYork, b: C.boston, car: [344308, 16952], region: 'US' },
  { a: C.losAngeles, b: C.sanFrancisco, car: [614620, 25660], region: 'US' },
  { a: C.sanFrancisco, b: extra.oakland, car: [18107, 1185], region: 'US' },
  { a: C.losAngeles, b: C.lasVegas, car: [434773, 17869], region: 'US' },
  { a: C.dallas, b: C.houston, car: [386183, 15302], region: 'US' },
  { a: C.chicago, b: extra.detroit, car: [452109, 18979], region: 'US' },
  { a: C.seattle, b: extra.portland, car: [278440, 12368], region: 'US' },
  { a: C.miami, b: extra.orlando, car: [375346, 15689], region: 'US' },
  { a: C.denver, b: extra.saltLake, car: [837532, 32395], region: 'US' },
  { a: C.london, b: C.manchester, car: [321801, 14761], region: 'UK' },
  { a: C.london, b: C.edinburgh, car: [649992, 28469], region: 'UK' },
  { a: C.glasgow, b: C.edinburgh, car: [74488, 3879], region: 'UK' },
  { a: C.cardiff, b: C.bristol, car: [70075, 3633], region: 'UK' },
  { a: C.belfast, b: C.dublin, car: [170160, 7281], region: 'UK' },
  { a: C.liverpool, b: C.birmingham, car: [158727, 6881], region: 'UK' },
  { a: C.london, b: extra.southampton, car: [129755, 6684], region: 'UK' },
  { a: C.edinburgh, b: extra.inverness, car: [251263, 12105], region: 'UK' },
];
