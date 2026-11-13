import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import landTopo from 'world-atlas/land-110m.json';

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;

/** World coastlines (Natural Earth, 1:110m) as GeoJSON. */
export const land = feature(topo, topo.objects.land) as FeatureCollection<Polygon | MultiPolygon>;
