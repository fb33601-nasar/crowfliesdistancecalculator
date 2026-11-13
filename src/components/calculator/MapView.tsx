import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, NavigationControl, setWorkerUrl } from 'maplibre-gl';
// The library finds its worker by file name at run time, which a bundler cannot follow,
// so the bundled worker is handed to it explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon } from '../../lib/geo';
import { wrapLon } from '../../lib/geo';
import { land } from './land';

interface Props {
  a: LatLon | null;
  b: LatLon | null;
  /** great-circle points as [lon, lat], longitudes unwrapped */
  line: [number, number][];
  picking: 'a' | 'b' | null;
  visible: boolean;
  onPick: (which: 'a' | 'b', point: LatLon) => void;
}

setWorkerUrl(workerUrl);

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** Used when the street map cannot be reached: coastlines only, no network needed. */
const OUTLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: { land: { type: 'geojson', data: land } },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': '#cfe2ec' } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f7f6ee' } },
    { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#9fb4c4', 'line-width': 0.8 } },
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

function pinElement(letter: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'map-pin';
  el.textContent = letter;
  return el;
}

export default function MapView({ a, b, line, picking, visible, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<{ a: Marker | null; b: Marker | null }>({ a: null, b: null });
  const latest = useRef({ picking, onPick });
  latest.current = { picking, onPick };
  const [ready, setReady] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    loadStyle().then(({ style, outlineOnly: fallback }) => {
      if (cancelled || !container.current) return;
      setOutlineOnly(fallback);
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: [-38, 40],
        zoom: 1.4,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      instance.on('load', () => {
        if (cancelled || !instance) return;
        instance.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        });
        instance.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        });
        instance.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c4157a', 'line-width': 3.5 },
        });
        setReady(true);
      });
      instance.on('click', (e) => {
        const { picking: target, onPick: pick } = latest.current;
        if (target) pick(target, { lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) });
      });
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, []);

  // Draw the line and the two pins whenever the places change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource('route') as GeoJSONSource | undefined;
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    });

    const place = (key: 'a' | 'b', point: LatLon | null, lon: number | undefined) => {
      const existing = markers.current[key];
      if (!point) {
        existing?.remove();
        markers.current[key] = null;
        return;
      }
      const at: [number, number] = [lon ?? point.lon, point.lat];
      if (existing) {
        existing.setLngLat(at);
        return;
      }
      const marker = new Marker({ element: pinElement(key.toUpperCase()), draggable: true })
        .setLngLat(at)
        .addTo(m);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        latest.current.onPick(key, { lat: p.lat, lon: wrapLon(p.lng) });
      });
      markers.current[key] = marker;
    };
    place('a', a, line[0]?.[0]);
    place('b', b, line[line.length - 1]?.[0]);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (line.length > 1) {
      const bounds = new LngLatBounds(line[0], line[0]);
      for (const p of line) bounds.extend(p);
      m.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: reduce ? 0 : 700 });
    } else if (a ?? b) {
      const only = (a ?? b)!;
      m.easeTo({ center: [only.lon, only.lat], zoom: Math.max(m.getZoom(), 4), duration: reduce ? 0 : 500 });
    }
  }, [ready, a?.lat, a?.lon, b?.lat, b?.lon]);

  // The canvas needs a nudge after being hidden behind the globe.
  useEffect(() => {
    if (visible) map.current?.resize();
  }, [visible, ready]);

  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = picking ? 'crosshair' : '';
  }, [picking, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map-canvas" />
      {!ready && <p className="map-status">Loading the map…</p>}
      {ready && outlineOnly && (
        <p className="map-status map-status-note">
          Street map unavailable right now. Showing coastlines only.
        </p>
      )}
      {picking && ready && (
        <p className="map-status map-status-pick" role="status">
          Click the map to set point {picking.toUpperCase()}
        </p>
      )}
    </div>
  );
}
