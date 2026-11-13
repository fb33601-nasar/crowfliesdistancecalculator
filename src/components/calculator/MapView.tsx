import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  NavigationControl,
  FullscreenControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
// The library finds its worker by file name at run time, which a bundler cannot follow,
// so the bundled worker is handed to it explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon, Unit } from '../../lib/geo';
import { wrapLon } from '../../lib/geo';
import { land } from './land';

setWorkerUrl(workerUrl);

interface Props {
  a: LatLon | null;
  b: LatLon | null;
  labelA: string;
  labelB: string;
  /** e.g. "3,471 mi", shown halfway along the line */
  distanceLabel: string;
  unit: Unit;
  /** great-circle points as [lon, lat], longitudes unwrapped */
  line: [number, number][];
  picking: 'a' | 'b' | null;
  visible: boolean;
  onPick: (which: 'a' | 'b', point: LatLon) => void;
}

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

function pinElement(letter: string): { root: HTMLElement; label: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'map-pin-wrap';
  const pin = document.createElement('div');
  pin.className = 'map-pin';
  pin.textContent = letter;
  const label = document.createElement('div');
  label.className = 'map-pin-label';
  root.append(pin, label);
  return { root, label };
}

export default function MapView({
  a,
  b,
  labelA,
  labelB,
  distanceLabel,
  unit,
  line,
  picking,
  visible,
  onPick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const scale = useRef<ScaleControl | null>(null);
  const markers = useRef<{
    a: { m: Marker; label: HTMLElement } | null;
    b: { m: Marker; label: HTMLElement } | null;
    mid: { m: Marker; el: HTMLElement } | null;
  }>({ a: null, b: null, mid: null });
  const latest = useRef({ picking, onPick });
  latest.current = { picking, onPick };
  const fit = useRef<(instant?: boolean) => void>(() => {});
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
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');
      instance.addControl(new FullscreenControl(), 'top-right');
      scale.current = new ScaleControl({ unit: unit === 'mi' ? 'imperial' : unit === 'nmi' ? 'nautical' : 'metric' });
      instance.addControl(scale.current, 'bottom-left');
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
          paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 },
        });
        instance.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c4157a', 'line-width': 4 },
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

  // Draw the line, the two labelled pins and the distance tag whenever the places change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('route') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    });

    const place = (key: 'a' | 'b', point: LatLon | null, lon: number | undefined, name: string) => {
      const existing = markers.current[key];
      if (!point) {
        existing?.m.remove();
        markers.current[key] = null;
        return;
      }
      const at: [number, number] = [lon ?? point.lon, point.lat];
      if (existing) {
        existing.m.setLngLat(at);
        existing.label.textContent = name;
        return;
      }
      const { root, label } = pinElement(key.toUpperCase());
      label.textContent = name;
      const marker = new Marker({ element: root, draggable: true, anchor: 'center' }).setLngLat(at).addTo(m);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        latest.current.onPick(key, { lat: p.lat, lon: wrapLon(p.lng) });
      });
      markers.current[key] = { m: marker, label };
    };
    place('a', a, line[0]?.[0], labelA);
    place('b', b, line[line.length - 1]?.[0], labelB);

    const midPoint = line.length > 2 ? line[Math.floor(line.length / 2)] : null;
    if (midPoint) {
      if (!markers.current.mid) {
        const el = document.createElement('div');
        el.className = 'map-distance';
        markers.current.mid = { m: new Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat(midPoint).addTo(m), el };
      }
      markers.current.mid.m.setLngLat(midPoint);
      markers.current.mid.el.textContent = distanceLabel;
    } else {
      markers.current.mid?.m.remove();
      markers.current.mid = null;
    }

    fit.current = (instant = false) => {
      const reduce = instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (line.length > 1) {
        const bounds = new LngLatBounds(line[0], line[0]);
        for (const p of line) bounds.extend(p);
        m.fitBounds(bounds, { padding: { top: 70, bottom: 50, left: 70, right: 70 }, maxZoom: 13, duration: reduce ? 0 : 800 });
      } else if (a ?? b) {
        const only = (a ?? b)!;
        m.easeTo({ center: [only.lon, only.lat], zoom: Math.max(m.getZoom(), 4), duration: reduce ? 0 : 500 });
      }
    };
    fit.current();
  }, [ready, a?.lat, a?.lon, b?.lat, b?.lon]);

  // Names and units can change without the points moving.
  useEffect(() => {
    if (markers.current.a) markers.current.a.label.textContent = labelA;
    if (markers.current.b) markers.current.b.label.textContent = labelB;
    if (markers.current.mid) markers.current.mid.el.textContent = distanceLabel;
    scale.current?.setUnit(unit === 'mi' ? 'imperial' : unit === 'nmi' ? 'nautical' : 'metric');
  }, [labelA, labelB, distanceLabel, unit, ready]);

  // The canvas needs a nudge after being hidden behind the globe.
  useEffect(() => {
    if (!visible || !map.current) return;
    map.current.resize();
    fit.current(true);
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
        <p className="map-status map-status-note">Street map unavailable right now. Showing coastlines only.</p>
      )}
    </div>
  );
}
