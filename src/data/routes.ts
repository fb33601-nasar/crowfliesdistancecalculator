import type { Place } from '../lib/geo';

const p = (name: string, lat: number, lon: number): Place => ({ name, lat, lon });

// City-centre coordinates from GeoNames.
export const C = {
  newYork: p('New York', 40.7143, -74.006),
  losAngeles: p('Los Angeles', 34.0522, -118.2437),
  chicago: p('Chicago', 41.85, -87.65),
  miami: p('Miami', 25.7743, -80.1937),
  sanFrancisco: p('San Francisco', 37.7749, -122.4194),
  lasVegas: p('Las Vegas', 36.175, -115.1372),
  houston: p('Houston', 29.7633, -95.3633),
  dallas: p('Dallas', 32.7831, -96.8067),
  seattle: p('Seattle', 47.6062, -122.3321),
  boston: p('Boston', 42.3584, -71.0598),
  denver: p('Denver', 39.7392, -104.9847),
  phoenix: p('Phoenix', 33.4484, -112.074),
  atlanta: p('Atlanta', 33.749, -84.388),
  honolulu: p('Honolulu', 21.3069, -157.8583),
  anchorage: p('Anchorage', 61.2181, -149.9003),
  london: p('London', 51.5085, -0.1257),
  edinburgh: p('Edinburgh', 55.9521, -3.1965),
  manchester: p('Manchester', 53.4809, -2.2374),
  birmingham: p('Birmingham', 52.4814, -1.8998),
  cardiff: p('Cardiff', 51.48, -3.18),
  liverpool: p('Liverpool', 53.4106, -2.9779),
  glasgow: p('Glasgow', 55.8651, -4.2576),
  belfast: p('Belfast', 54.5968, -5.9254),
  dublin: p('Dublin', 53.3331, -6.2489),
  leeds: p('Leeds', 53.7965, -1.5478),
  bristol: p('Bristol', 51.4552, -2.5966),
  paris: p('Paris', 48.8534, 2.3488),
  tokyo: p('Tokyo', 35.6895, 139.6917),
  sydney: p('Sydney', -33.8678, 151.2073),
  singapore: p('Singapore', 1.2897, 103.8501),
  dubai: p('Dubai', 25.0772, 55.3093),
  capeTown: p('Cape Town', -33.9258, 18.4232),
  auckland: p('Auckland', -36.8485, 174.7635),
  toronto: p('Toronto', 43.7001, -79.4163),
} as const;

export type Route = [Place, Place];

export const US_ROUTES: Route[] = [
  [C.newYork, C.losAngeles],
  [C.newYork, C.chicago],
  [C.newYork, C.miami],
  [C.losAngeles, C.sanFrancisco],
  [C.losAngeles, C.lasVegas],
  [C.chicago, C.houston],
  [C.dallas, C.houston],
  [C.seattle, C.miami],
  [C.denver, C.phoenix],
  [C.atlanta, C.dallas],
  [C.boston, C.chicago],
  [C.honolulu, C.anchorage],
];

export const UK_ROUTES: Route[] = [
  [C.london, C.edinburgh],
  [C.london, C.manchester],
  [C.london, C.birmingham],
  [C.london, C.cardiff],
  [C.manchester, C.liverpool],
  [C.glasgow, C.edinburgh],
  [C.belfast, C.dublin],
  [C.leeds, C.bristol],
];

export const WORLD_ROUTES: Route[] = [
  [C.newYork, C.london],
  [C.london, C.paris],
  [C.toronto, C.london],
  [C.losAngeles, C.tokyo],
  [C.dubai, C.london],
  [C.london, C.capeTown],
  [C.singapore, C.newYork],
  [C.london, C.sydney],
  [C.sydney, C.auckland],
];

export const ALL_ROUTES: Route[] = [...US_ROUTES, ...UK_ROUTES, ...WORLD_ROUTES];
