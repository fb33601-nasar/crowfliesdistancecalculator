import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  NavigationControl,
  FullscreenControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon } from '../../lib/geo';
import { circleRing, destination, haversine, wrapLon } from '../../lib/geo';
import { land } from './land';

setWorkerUrl(workerUrl);

export interface MapCircle {
  id: string;
  center: LatLon;
  radius: number;
  color: string;
  selected: boolean;
  /** e.g. "10 mi" */
  label: string;
}

interface Props {
  circles: MapCircle[];
  /** a place being tested against the selected circle */
  probe: (LatLon & { inside: boolean }) | null;
  imperial: boolean;
  picking: boolean;
  visible: boolean;
  onPick: (point: LatLon) => void;
  onMoveCenter: (id: string, point: LatLon) => void;
  onResize: (id: string, radius: number) => void;
  onSelect: (id: string) => void;
}

export interface RadiusMapHandle {
  /** PNG of the current map view, or null if the map is not ready */
  snapshot: () => string | null;
}

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
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

function toGeoJSON(circles: MapCircle[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: circles.map((c) => ({
      type: 'Feature',
      properties: { id: c.id, color: c.color, selected: c.selected ? 1 : 0 },
      geometry: { type: 'Polygon', coordinates: [circleRing(c.center, c.radius, 160)] },
    })),
  };
}

const RadiusMapView = forwardRef<RadiusMapHandle, Props>(function RadiusMapView(
  { circles, probe, imperial, picking, visible, onPick, onMoveCenter, onResize, onSelect },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const scale = useRef<ScaleControl | null>(null);
  const centers = useRef(new Map<string, Marker>());
  const handle = useRef<Marker | null>(null);
  const tag = useRef<Marker | null>(null);
  const probeMarker = useRef<Marker | null>(null);
  const latest = useRef({ circles, picking, onPick, onMoveCenter, onResize, onSelect });
  latest.current = { circles, picking, onPick, onMoveCenter, onResize, onSelect };
  const [ready, setReady] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);
  const fittedFor = useRef('');
  const resizing = useRef(false);

  useImperativeHandle(ref, () => ({
    snapshot: () => {
      try {
        return map.current?.getCanvas().toDataURL('image/png') ?? null;
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    loadStyle().then(({ style, outlineOnly: fallback }) => {
      if (cancelled || !container.current) return;
      setOutlineOnly(fallback);
      instance = new MapLibreMap({
        container: container.current,
        style,
        center: [-87.65, 41.85],
        zoom: 8,
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
        instance.addSource('circles', { type: 'geojson', data: toGeoJSON(latest.current.circles) });
        instance.addLayer({
          id: 'circle-fill',
          type: 'fill',
          source: 'circles',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.2, 0.1],
          },
        });
        instance.addLayer({
          id: 'circle-edge',
          type: 'line',
          source: 'circles',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'selected'], 1], 3, 2],
          },
        });
        instance.on('click', 'circle-fill', (e) => {
          if (latest.current.picking) return;
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) latest.current.onSelect(id);
        });
        setReady(true);
      });
      instance.on('click', (e) => {
        if (latest.current.picking) latest.current.onPick({ lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) });
      });
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, []);

  // Redraw circles, centers, the resize handle and the radius tag.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('circles') as GeoJSONSource | undefined)?.setData(toGeoJSON(circles));

    const seen = new Set<string>();
    for (const c of circles) {
      seen.add(c.id);
      let mk = centers.current.get(c.id);
      if (!mk) {
        const el = document.createElement('div');
        el.className = 'radius-center';
        mk = new Marker({ element: el, draggable: true }).setLngLat([c.center.lon, c.center.lat]).addTo(m);
        const id = c.id;
        mk.on('dragend', () => {
          const p = mk!.getLngLat();
          latest.current.onMoveCenter(id, { lat: p.lat, lon: wrapLon(p.lng) });
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          latest.current.onSelect(id);
        });
        centers.current.set(c.id, mk);
      }
      mk.setLngLat([c.center.lon, c.center.lat]);
      const el = mk.getElement();
      el.style.setProperty('--c', c.color);
      el.classList.toggle('is-selected', c.selected);
    }
    for (const [id, mk] of centers.current) {
      if (!seen.has(id)) {
        mk.remove();
        centers.current.delete(id);
      }
    }

    const sel = circles.find((c) => c.selected);
    if (sel) {
      const east = destination(sel.center, 90, sel.radius);
      let eastLon = east.lon;
      while (eastLon - sel.center.lon < -180) eastLon += 360;
      if (!handle.current) {
        const el = document.createElement('div');
        el.className = 'radius-handle';
        el.title = 'Drag to resize';
        handle.current = new Marker({ element: el, draggable: true }).setLngLat([eastLon, east.lat]).addTo(m);
        handle.current.on('dragstart', () => {
          resizing.current = true;
        });
        handle.current.on('dragend', () => {
          resizing.current = false;
        });
        handle.current.on('drag', () => {
          const s = latest.current.circles.find((c) => c.selected);
          if (!s || !handle.current) return;
          const p = handle.current.getLngLat();
          latest.current.onResize(s.id, Math.max(10, haversine(s.center, { lat: p.lat, lon: p.lng })));
        });
      }
      if (!resizing.current) handle.current.setLngLat([eastLon, east.lat]);
      const north = destination(sel.center, 0, sel.radius);
      if (!tag.current) {
        const el = document.createElement('div');
        el.className = 'map-distance';
        tag.current = new Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat([sel.center.lon, north.lat]).addTo(m);
      }
      tag.current.setLngLat([sel.center.lon, north.lat]);
      tag.current.getElement().textContent = sel.label;
    }

    // Frame the selected circle when it is new or its center moved.
    const key = sel ? `${sel.id}:${sel.center.lat.toFixed(4)},${sel.center.lon.toFixed(4)}:${Math.round(sel.radius / 1000)}` : '';
    if (sel && resizing.current) fittedFor.current = key;
    if (sel && key !== fittedFor.current) {
      fittedFor.current = key;
      const ring = circleRing(sel.center, sel.radius, 64);
      const bounds = new LngLatBounds(ring[0], ring[0]);
      for (const p of ring) bounds.extend(p);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      m.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: reduce ? 0 : 600 });
    }
  }, [ready, circles]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!probe) {
      probeMarker.current?.remove();
      probeMarker.current = null;
      return;
    }
    if (!probeMarker.current) {
      const el = document.createElement('div');
      el.className = 'radius-probe';
      probeMarker.current = new Marker({ element: el }).setLngLat([probe.lon, probe.lat]).addTo(m);
    }
    probeMarker.current.setLngLat([probe.lon, probe.lat]);
    probeMarker.current.getElement().classList.toggle('is-out', !probe.inside);
  }, [ready, probe?.lat, probe?.lon, probe?.inside]);

  useEffect(() => {
    scale.current?.setUnit(imperial ? 'imperial' : 'metric');
  }, [imperial, ready]);

  useEffect(() => {
    if (!visible || !map.current) return;
    map.current.resize();
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
});

export default RadiusMapView;
