import L from 'leaflet';
import type { MapSettings } from '../api/client.js';

const DEFAULT_CENTER: [number, number] = [4.62, 96.84];
const DEFAULT_ZOOM = 12;
const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string) ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function initMap(settings: MapSettings): L.Map {
  const center: [number, number] = [settings.center.lat, settings.center.lon];
  const zoom = settings.zoom;

  const mapOptions: L.MapOptions = {
    center: center ?? DEFAULT_CENTER,
    zoom: zoom ?? DEFAULT_ZOOM,
    zoomControl: true,
    attributionControl: true,
  };

  // Apply bounds if provided
  if (settings.bounds) {
    const { minLat, minLon, maxLat, maxLon } = settings.bounds;
    // Add padding to allow slight movement outside bounds
    const latPad = (maxLat - minLat) * 0.1;
    const lonPad = (maxLon - minLon) * 0.1;
    mapOptions.maxBounds = L.latLngBounds(
      [minLat - latPad, minLon - lonPad],
      [maxLat + latPad, maxLon + lonPad]
    );
    mapOptions.maxBoundsViscosity = 0.9;

    // Calculate minimum zoom so the whole area fits
    const bounds = L.latLngBounds([minLat, minLon], [maxLat, maxLon]);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      const tempMap = L.map(document.createElement('div'));
      const fitZoom = tempMap.getBoundsZoom(bounds);
      tempMap.remove();
      mapOptions.minZoom = Math.max(1, fitZoom - 1);
    }
  }

  const map = L.map('map', mapOptions);

  L.tileLayer(TILE_URL, {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  }).addTo(map);

  return map;
}
