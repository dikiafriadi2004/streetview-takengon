import L from 'leaflet';

const MARKER_COLOR = '#F08A1C';
const CONE_COLOR = '#F08A1C';
const CONE_OPACITY = 0.5;
const CONE_HALF_ANGLE = 30; // degrees each side of heading

function createMarkerIcon(headingDeg: number): L.DivIcon {
  const svgSize = 48;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const r = 10;
  const coneLen = 22;
  const halfAngle = CONE_HALF_ANGLE;

  // Cone points (pointing up = north = 0°)
  const leftAngle = ((headingDeg - halfAngle - 90) * Math.PI) / 180;
  const rightAngle = ((headingDeg + halfAngle - 90) * Math.PI) / 180;
  const tipAngle = ((headingDeg - 90) * Math.PI) / 180;

  const lx = cx + Math.cos(leftAngle) * r;
  const ly = cy + Math.sin(leftAngle) * r;
  const rx = cx + Math.cos(rightAngle) * r;
  const ry = cy + Math.sin(rightAngle) * r;
  const tx = cx + Math.cos(tipAngle) * (r + coneLen);
  const ty = cy + Math.sin(tipAngle) * (r + coneLen);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
    <polygon points="${tx},${ty} ${lx},${ly} ${rx},${ry}"
             fill="${CONE_COLOR}" fill-opacity="${CONE_OPACITY}" stroke="none"/>
    <circle cx="${cx}" cy="${cy}" r="${r}"
            fill="${MARKER_COLOR}" stroke="white" stroke-width="2"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'position-marker',
    iconSize: [svgSize, svgSize],
    iconAnchor: [cx, cy],
  });
}

export class PositionMarker {
  private marker: L.Marker | null = null;
  private map: L.Map;
  private headingDeg: number = 0;

  constructor(map: L.Map) {
    this.map = map;
  }

  update(lat: number, lon: number, headingDeg: number): void {
    this.headingDeg = headingDeg;
    const icon = createMarkerIcon(headingDeg);

    if (!this.marker) {
      this.marker = L.marker([lat, lon], { icon, zIndexOffset: 1000 });
      this.marker.addTo(this.map);
    } else {
      this.marker.setLatLng([lat, lon]);
      this.marker.setIcon(icon);
    }
  }

  updateHeading(deg: number): void {
    this.headingDeg = deg;
    if (this.marker) {
      this.marker.setIcon(createMarkerIcon(deg));
    }
  }

  remove(): void {
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
  }

  getLatLng(): L.LatLng | null {
    return this.marker ? this.marker.getLatLng() : null;
  }
}
