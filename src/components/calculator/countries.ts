// Country outlines and names (Natural Earth, 1:110m). Loaded on demand by the globe.
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { geoArea, geoBounds, geoCentroid } from 'd3-geo';
import topo from 'world-atlas/countries-110m.json';

const t = topo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;

const SHORT: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands',
  'W. Sahara': 'Western Sahara',
  'N. Cyprus': 'Northern Cyprus',
  "Côte d'Ivoire": 'Ivory Coast',
};

/** Hand-placed label points where the geometric centre falls somewhere odd. */
const LABEL_AT: Record<string, [number, number]> = {
  'United States': [-99, 39],
  Canada: [-102, 58],
  Russia: [95, 62],
  France: [2.4, 46.6],
  Norway: [9, 61.5],
  Chile: [-71, -32],
  Indonesia: [114, -1],
  'New Zealand': [172.5, -42],
  Japan: [138.5, 36.5],
  Malaysia: [102, 4],
  Vietnam: [106, 15],
};

export interface Country {
  name: string;
  feature: Feature<Polygon | MultiPolygon, { name: string }>;
  /** label point [lon, lat] */
  at: [number, number];
  /** area in steradians, used to decide when a label fits */
  area: number;
  /** bounding box, to skip the containment test for far-away countries */
  bounds: [[number, number], [number, number]];
}

const features = feature(t, t.objects.countries).features as Feature<Polygon | MultiPolygon, { name: string }>[];

export const countries: Country[] = features
  .map((f) => {
    const name = SHORT[f.properties.name] ?? f.properties.name;
    return {
      name,
      feature: f,
      at: LABEL_AT[name] ?? (geoCentroid(f) as [number, number]),
      area: geoArea(f),
      bounds: geoBounds(f) as [[number, number], [number, number]],
    };
  })
  .sort((a, b) => b.area - a.area);

export const borders = mesh(t, t.objects.countries, (a, b) => a !== b) as MultiLineString;
