import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, FullscreenControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon } from '../../lib/geo';
import { wrapLon } from '../../lib/geo';
import { land } from './land';
import type { Band } from './isochrone';
import { bbox } from './isochrone';

setWorkerUrl(workerUrl);

/** Sequential ramp, darkest for the shortest time. */
export const BAND_COLORS = ['#7a0e4e', '#c4157a', '#ee5aa6', '#f7a8d0'];

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OUTLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: { land: { type: 'geojson', data: land } },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': '#cfe2ec' } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f7f6ee' } },
  ],
};

async function loadStyle(): Promise<{ style: StyleSpecification | string; outlineOnly: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(STREET_STYLE, { signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status));
    return { style: (await res.json()) as StyleSpecification, outlineOnly: false };
  } catch {
    return { style: OUTLINE_STYLE, outlineOnly: true };
  } finally {
    clearTimeout(timer);
  }
}

interface Props {
  center: LatLon | null;
  bands: Band[];
  imperial: boolean;
  picking: boolean;
  onMove: (p: LatLon) => void;
}

export default function DriveTimeMapView({ center, bands, imperial, picking, onMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const scale = useRef<ScaleControl | null>(null);
  const latest = useRef({ onMove, picking });
  latest.current = { onMove, picking };
  const [ready, setReady] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);
  const fitKey = useRef('');

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    loadStyle().then(({ style, outlineOnly: fallback }) => {
      if (cancelled || !container.current) return;
      setOutlineOnly(fallback);
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: center ? [center.lon, center.lat] : [-87.63, 41.88],
        zoom: 9,
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      instance.addControl(new FullscreenControl(), 'top-right');
      scale.current = new ScaleControl({ unit: imperial ? 'imperial' : 'metric' });
      instance.addControl(scale.current, 'bottom-left');
      instance.on('load', () => {
        if (cancelled || !instance) return;
        instance.addSource('bands', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'band-fill', type: 'fill', source: 'bands', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 } });
        instance.addLayer({ id: 'band-line', type: 'line', source: 'bands', filter: ['==', ['get', 'estimated'], 0], paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
        instance.addLayer({ id: 'band-line-est', type: 'line', source: 'bands', filter: ['==', ['get', 'estimated'], 1], paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2] } });
        setReady(true);
      });
      instance.on('click', (e) => {
        if (latest.current.picking) latest.current.onMove({ lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) });
      });
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    // Largest first so smaller bands draw on top.
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [...bands]
        .map((b, i) => ({ b, color: BAND_COLORS[Math.min(i, BAND_COLORS.length - 1)] }))
        .reverse()
        .map(({ b, color }) => ({ type: 'Feature', properties: { color, minutes: b.minutes, estimated: b.estimated ? 1 : 0 }, geometry: b.geometry })),
    };
    (m.getSource('bands') as GeoJSONSource | undefined)?.setData(fc);
    if (center) {
      if (!marker.current) {
        const el = document.createElement('div');
        el.className = 'radius-center is-selected';
        el.style.setProperty('--c', '#161b3d');
        marker.current = new Marker({ element: el, draggable: true }).setLngLat([center.lon, center.lat]).addTo(m);
        marker.current.on('dragend', () => {
          const q = marker.current!.getLngLat();
          latest.current.onMove({ lat: q.lat, lon: wrapLon(q.lng) });
        });
      } else marker.current.setLngLat([center.lon, center.lat]);
    }
    const biggest = bands[bands.length - 1];
    const key = biggest ? `${bands.map((b) => b.minutes).join(',')}|${bbox(biggest.geometry).map((v) => v.toFixed(2)).join(',')}` : '';
    if (biggest && key !== fitKey.current) {
      fitKey.current = key;
      const [a, b, c, d] = bbox(biggest.geometry);
      m.fitBounds([[a, b], [c, d]], { padding: 40, duration: 0, maxZoom: 14 });
    } else if (!biggest && center) m.setCenter([center.lon, center.lat]);
  }, [ready, bands, center?.lat, center?.lon]);

  useEffect(() => {
    scale.current?.setUnit(imperial ? 'imperial' : 'metric');
  }, [imperial, ready]);

  useEffect(() => {
    const c = map.current?.getCanvas();
    if (c) c.style.cursor = picking ? 'crosshair' : '';
  }, [picking, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map-canvas" />
      {!ready && <p className="map-status">Loading the map…</p>}
      {ready && outlineOnly && <p className="map-status map-status-note">Street map unavailable right now. Showing coastlines only.</p>}
    </div>
  );
}
