import L from 'leaflet';

const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string) ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export class MiniMap {
  private map: L.Map | null = null;
  private container: HTMLElement;
  private dotMarker: L.Marker | null = null;
  private routeLayer: L.Polyline | null = null;
  private currentLat: number = 0;
  private currentLon: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  initialize(lat: number, lon: number): void {
    if (this.map) {
      this.map.setView([lat, lon], 17);
      return;
    }

    this.map = L.map(this.container, {
      center: [lat, lon],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
    }).addTo(this.map);

    this.currentLat = lat;
    this.currentLon = lon;
  }

  update(lat: number, lon: number, headingDeg: number): void {
    if (!this.map) {
      this.initialize(lat, lon);
    }

    this.currentLat = lat;
    this.currentLon = lon;

    const icon = this.createDotIcon(headingDeg);

    if (!this.dotMarker) {
      this.dotMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 });
      this.dotMarker.addTo(this.map!);
    } else {
      this.dotMarker.setLatLng([lat, lon]);
      this.dotMarker.setIcon(icon);
    }

    // Pan minimap to follow the marker
    this.map!.setView([lat, lon], this.map!.getZoom(), { animate: true });
  }

  private createDotIcon(headingDeg: number): L.DivIcon {
    const size = 24;
    const cx = size / 2;
    const cy = size / 2;
    const r = 6;
    const coneLen = 12;
    const halfAngle = 25;

    const leftAngle = ((headingDeg - halfAngle - 90) * Math.PI) / 180;
    const rightAngle = ((headingDeg + halfAngle - 90) * Math.PI) / 180;
    const tipAngle = ((headingDeg - 90) * Math.PI) / 180;

    const lx = cx + Math.cos(leftAngle) * r;
    const ly = cy + Math.sin(leftAngle) * r;
    const rx = cx + Math.cos(rightAngle) * r;
    const ry = cy + Math.sin(rightAngle) * r;
    const tx = cx + Math.cos(tipAngle) * (r + coneLen);
    const ty = cy + Math.sin(tipAngle) * (r + coneLen);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <polygon points="${tx},${ty} ${lx},${ly} ${rx},${ry}"
               fill="#F08A1C" fill-opacity="0.6"/>
      <circle cx="${cx}" cy="${cy}" r="${r}"
              fill="#F08A1C" stroke="white" stroke-width="1.5"/>
    </svg>`;

    return L.divIcon({
      html: svg,
      className: 'minimap-dot',
      iconSize: [size, size],
      iconAnchor: [cx, cy],
    });
  }

  showRoute(coords: [number, number][]): void {
    if (!this.map) return;

    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    if (coords.length >= 2) {
      this.routeLayer = L.polyline(coords, {
        color: '#2A7BE4',
        weight: 2,
        opacity: 0.7,
      });
      this.routeLayer.addTo(this.map);
    }
  }

  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.dotMarker = null;
    this.routeLayer = null;
  }
}
