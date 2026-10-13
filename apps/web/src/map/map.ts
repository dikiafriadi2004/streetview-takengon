import L from 'leaflet';
import type { MapSettings } from '../api/client.js';

const DEFAULT_CENTER: [number, number] = [4.62, 96.84];
const DEFAULT_ZOOM = 12;

// Tile URL: OpenStreetMap — gratis, tanpa API key
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

export function initMap(settings: MapSettings): L.Map {
  const center: [number, number] = settings.center
    ? [Number(settings.center.lat), Number(settings.center.lon)]
    : DEFAULT_CENTER;
  const zoom = settings.zoom ?? DEFAULT_ZOOM;

  const mapOptions: L.MapOptions = {
    center,
    zoom,
    zoomControl: true,
    attributionControl: true,
  };

  // Apply map bounds if configured
  if (settings.bounds) {
    const { minLat, minLon, maxLat, maxLon } = settings.bounds;
    const latPad = (Number(maxLat) - Number(minLat)) * 0.15;
    const lonPad = (Number(maxLon) - Number(minLon)) * 0.15;
    mapOptions.maxBounds = L.latLngBounds(
      [Number(minLat) - latPad, Number(minLon) - lonPad],
      [Number(maxLat) + latPad, Number(maxLon) + lonPad],
    );
    mapOptions.maxBoundsViscosity = 0.85;
    mapOptions.minZoom = 9; // Prevent zooming out too far
  }

  const map = L.map('map', mapOptions);

  // Add tile layer
  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  }).addTo(map);

  return map;
}
