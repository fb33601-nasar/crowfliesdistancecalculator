import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, NavigationControl, FullscreenControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLon } from '../../lib/geo';
import { greatCirclePath, wrapLon } from '../../lib/geo';
import { land } from './land';

setWorkerUrl(workerUrl);

export interface HalfwayMark extends LatLon {
  /** short text on the marker, e.g. "½" */
  glyph: string;
  label: string;
  tone: 'line' | 'road' | 'time';
}

interface Props {
  places: (LatLon & { letter: string; label: string })[];
  /** where dashed spokes from each place meet */
  hub: LatLon | null;
  marks: HalfwayMark[];
  roadLine: [number, number][] | null;
  imperial: boolean;
  picking: number | null;
  visible: boolean;
  onPick: (index: number, p: LatLon) => void;
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

const empty: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };

export default function HalfwayMapView({ places, hub, marks, roadLine, imperial, picking, visible, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const scale = useRef<ScaleControl | null>(null);
  const pins = useRef<{ m: Marker; label: HTMLElement; pin: HTMLElement }[]>([]);
  const markEls = useRef<Marker[]>([]);
  const latest = useRef({ picking, onPick });
  latest.current = { picking, onPick };
  const [ready, setReady] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);
  const fitKey = useRef('');

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    loadStyle().then(({ style, outlineOnly: fallback }) => {
      if (cancelled || !container.current) return;
      setOutlineOnly(fallback);
      instance = new MapLibreMap({ container: container.current, style, center: [-90, 38], zoom: 3, attributionControl: { compact: true } });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      instance.addControl(new FullscreenControl(), 'top-right');
      scale.current = new ScaleControl({ unit: imperial ? 'imperial' : 'metric' });
      instance.addControl(scale.current, 'bottom-left');
      instance.on('load', () => {
        if (cancelled || !instance) return;
        instance.addSource('spokes', { type: 'geojson', data: empty });
        instance.addSource('road', { type: 'geojson', data: empty });
        instance.addLayer({ id: 'road-casing', type: 'line', source: 'road', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9 } });
        instance.addLayer({ id: 'road', type: 'line', source: 'road', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#161b3d', 'line-width': 5 } });
        instance.addLayer({ id: 'spokes', type: 'line', source: 'spokes', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#c4157a', 'line-width': 3, 'line-dasharray': [1.4, 1.6] } });
        setReady(true);
      });
      instance.on('click', (e) => {
        const { picking: idx, onPick: pick } = latest.current;
        if (idx !== null) pick(idx, { lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) });
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
    const spokes: FeatureCollection<LineString> = {
      type: 'FeatureCollection',
      features: hub ? places.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: greatCirclePath(p, hub, 64) } })) : [],
    };
    (m.getSource('spokes') as GeoJSONSource | undefined)?.setData(spokes);
    (m.getSource('road') as GeoJSONSource | undefined)?.setData(
      roadLine && roadLine.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: roadLine } }] } : empty,
    );
    if (m.getLayer('spokes')) m.setPaintProperty('spokes', 'line-opacity', roadLine ? 0.55 : 1);

    // Place pins.
    while (pins.current.length > places.length) pins.current.pop()!.m.remove();
    places.forEach((p, i) => {
      let rec = pins.current[i];
      if (!rec) {
        const root = document.createElement('div');
        root.className = 'map-pin-wrap';
        const pin = document.createElement('div');
        pin.className = 'map-pin';
        const label = document.createElement('div');
        label.className = 'map-pin-label';
        root.append(pin, label);
        const mk = new Marker({ element: root, draggable: true, anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(m);
        mk.on('dragend', () => {
          const q = mk.getLngLat();
          latest.current.onPick(i, { lat: q.lat, lon: wrapLon(q.lng) });
        });
        rec = { m: mk, label, pin };
        pins.current[i] = rec;
      }
      rec.m.setLngLat([p.lon, p.lat]);
      rec.pin.textContent = p.letter;
      rec.label.textContent = p.label;
    });

    // Halfway marks.
    markEls.current.forEach((mk) => mk.remove());
    markEls.current = marks.map((h) => {
      const el = document.createElement('div');
      el.className = `halfway-mark is-${h.tone}`;
      el.innerHTML = `<span class="halfway-glyph"></span><span class="halfway-label"></span>`;
      (el.firstChild as HTMLElement).textContent = h.glyph;
      (el.lastChild as HTMLElement).textContent = h.label;
      return new Marker({ element: el, anchor: 'left', offset: [-15, 0] }).setLngLat([h.lon, h.lat]).addTo(m);
    });

    const key = places.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join('|') + (roadLine ? `r${roadLine.length}` : '');
    if (key !== fitKey.current && places.length) {
      fitKey.current = key;
      const b = new LngLatBounds([places[0].lon, places[0].lat], [places[0].lon, places[0].lat]);
      places.forEach((p) => b.extend([p.lon, p.lat]));
      marks.forEach((h) => b.extend([h.lon, h.lat]));
      roadLine?.forEach((p) => b.extend(p));
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      m.fitBounds(b, { padding: { top: 70, bottom: 50, left: 60, right: 130 }, maxZoom: 13, duration: reduce ? 0 : 700 });
    }
  }, [ready, places, hub?.lat, hub?.lon, marks, roadLine]);

  useEffect(() => {
    scale.current?.setUnit(imperial ? 'imperial' : 'metric');
  }, [imperial, ready]);

  useEffect(() => {
    if (!visible || !map.current) return;
    map.current.resize();
  }, [visible, ready]);

  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = picking !== null ? 'crosshair' : '';
  }, [picking, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map-canvas" />
      {!ready && <p className="map-status">Loading the map…</p>}
      {ready && outlineOnly && <p className="map-status map-status-note">Street map unavailable right now. Showing coastlines only.</p>}
    </div>
  );
}
