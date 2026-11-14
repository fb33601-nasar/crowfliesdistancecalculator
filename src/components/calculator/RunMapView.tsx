import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, NavigationControl, FullscreenControl, ScaleControl, GeolocateControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon } from '../../lib/geo';
import { wrapLon } from '../../lib/geo';
import { land } from './land';

setWorkerUrl(workerUrl);

export interface RunMapHandle {
  fit: () => void;
  locate: () => void;
  flyTo: (p: LatLon) => void;
}

interface Props {
  points: LatLon[];
  line: [number, number][];
  markers: { p: LatLon; label: string }[];
  imperial: boolean;
  onAdd: (p: LatLon) => void;
  onMove: (i: number, p: LatLon) => void;
  onRemove: (i: number) => void;
}

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

const RunMapView = forwardRef<RunMapHandle, Props>(function RunMapView({ points, line, markers, imperial, onAdd, onMove, onRemove }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const scale = useRef<ScaleControl | null>(null);
  const geo = useRef<GeolocateControl | null>(null);
  const vertices = useRef<Marker[]>([]);
  const markerEls = useRef<Marker[]>([]);
  const latest = useRef({ onAdd, onMove, onRemove });
  latest.current = { onAdd, onMove, onRemove };
  const dragging = useRef(false);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);

  function fit() {
    const m = map.current;
    if (!m || !line.length) return;
    const b = new LngLatBounds(line[0], line[0]);
    line.forEach((p) => b.extend(p));
    m.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
  }
  useImperativeHandle(ref, () => ({ fit, locate: () => geo.current?.trigger(), flyTo: (p) => map.current?.flyTo({ center: [p.lon, p.lat], zoom: 15, duration: 600 }) }), [line]);

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    loadStyle().then(({ style, outlineOnly: fallback }) => {
      if (cancelled || !container.current) return;
      setOutlineOnly(fallback);
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: points[0] ? [points[0].lon, points[0].lat] : [-73.9665, 40.7812],
        zoom: 14,
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer: true },
        doubleClickZoom: false,
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      geo.current = new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true });
      instance.addControl(geo.current, 'top-right');
      instance.addControl(new FullscreenControl(), 'top-right');
      scale.current = new ScaleControl({ unit: imperial ? 'imperial' : 'metric' });
      instance.addControl(scale.current, 'bottom-left');
      instance.getCanvas().style.cursor = 'crosshair';
      instance.on('load', () => {
        if (cancelled || !instance) return;
        instance.addSource('run', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'run-casing', type: 'line', source: 'run', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9 } });
        instance.addLayer({ id: 'run', type: 'line', source: 'run', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c4157a', 'line-width': 5 } });
        setReady(true);
      });
      instance.on('click', (e) => {
        if (dragging.current) return;
        latest.current.onAdd({ lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) });
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
    (m.getSource('run') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: line.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] : [],
    });

    while (vertices.current.length > points.length) vertices.current.pop()!.remove();
    points.forEach((p, i) => {
      let mk = vertices.current[i];
      if (!mk) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'run-vertex';
        el.setAttribute('aria-label', 'Route point. Double-click to remove');
        const marker = new Marker({ element: el, draggable: true }).setLngLat([p.lon, p.lat]).addTo(m);
        mk = marker;
        marker.on('dragstart', () => (dragging.current = true));
        marker.on('dragend', () => {
          const q = marker.getLngLat();
          latest.current.onMove(Number(el.dataset.i), { lat: q.lat, lon: wrapLon(q.lng) });
          setTimeout(() => (dragging.current = false), 50);
        });
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          latest.current.onRemove(Number(el.dataset.i));
        });
        vertices.current[i] = mk;
      }
      mk.setLngLat([p.lon, p.lat]);
      const el = mk.getElement();
      el.dataset.i = String(i);
      el.classList.toggle('is-start', i === 0);
      el.classList.toggle('is-end', i === points.length - 1 && i > 0);
      el.textContent = i === 0 ? 'S' : i === points.length - 1 ? 'F' : '';
    });

    markerEls.current.forEach((mk) => mk.remove());
    markerEls.current = markers.map((x) => {
      const el = document.createElement('div');
      el.className = 'run-mile';
      el.textContent = x.label;
      return new Marker({ element: el }).setLngLat([x.p.lon, x.p.lat]).addTo(m);
    });

    if (!fitted.current && line.length > 1) {
      fitted.current = true;
      fit();
    }
  }, [ready, points, line, markers]);

  useEffect(() => {
    scale.current?.setUnit(imperial ? 'imperial' : 'metric');
  }, [imperial, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map-canvas" />
      {!ready && <p className="map-status">Loading the map…</p>}
      {ready && outlineOnly && <p className="map-status map-status-note">Street map unavailable right now. Showing coastlines only.</p>}
    </div>
  );
});

export default RunMapView;
