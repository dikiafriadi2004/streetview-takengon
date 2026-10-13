import 'leaflet/dist/leaflet.css';
import '@photo-sphere-viewer/core/index.css';
import './styles/main.css';

import L from 'leaflet';

// Fix Leaflet default icon (required for Vite builds)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

import { getMapSettings, getPhoto } from './api/client.js';
import type { Photo, PhotoDetail } from './api/client.js';
import { initMap } from './map/map.js';
import { createCoverageManager } from './map/coverage.js';
import { PositionMarker } from './map/marker.js';
import { StreetViewCard } from './ui/card.js';
import { PanoramaViewer } from './viewer/panorama.js';
import { NavigationArrows } from './viewer/arrows.js';
import { MiniMap } from './viewer/minimap.js';
import { ViewerControls } from './ui/controls.js';
import { ReportModal } from './ui/report.js';
import { i18n } from './i18n/id.js';

// ===========================
// App State
// ===========================
interface AppState {
  selectedPhotoId: number | null;
  currentPhoto: PhotoDetail | null;
  viewerHeading: number;
  viewerOpen: boolean;
}

const state: AppState = {
  selectedPhotoId: null,
  currentPhoto: null,
  viewerHeading: 0,
  viewerOpen: false,
};

// ===========================
// DOM Setup
// ===========================

// Map title box
const titleBox = document.createElement('div');
titleBox.className = 'map-title-box';
titleBox.textContent = i18n.appTitle;
document.body.appendChild(titleBox);

// Street View card sits inside app-root (pointer-events auto on the card itself)
const appRoot = document.getElementById('app-root')!;

// Viewer overlay (hidden initially, outside app-root so it can cover everything)
const viewerOverlay = document.createElement('div');
viewerOverlay.className = 'viewer-overlay';
viewerOverlay.style.display = 'none';
viewerOverlay.setAttribute('role', 'main');
viewerOverlay.setAttribute('aria-label', 'Penampil Street View');
document.body.appendChild(viewerOverlay);

// Viewer canvas (PSV container)
const viewerCanvas = document.createElement('div');
viewerCanvas.className = 'viewer-canvas';
viewerCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
viewerOverlay.appendChild(viewerCanvas);

// Minimap container
const minimapEl = document.createElement('div');
minimapEl.className = 'minimap';
minimapEl.setAttribute('aria-label', i18n.ariaMinimap ?? 'Peta mini');
viewerOverlay.appendChild(minimapEl);

// Location info (top-right in viewer)
const locationInfo = document.createElement('div');
locationInfo.className = 'location-info';
viewerOverlay.appendChild(locationInfo);

// Report button (bottom-right area, above controls)
const reportBtn = document.createElement('button');
reportBtn.className = 'report-btn';
reportBtn.innerHTML = '🚩';
reportBtn.setAttribute('aria-label', i18n.report ?? 'Laporkan');
reportBtn.setAttribute('title', i18n.report ?? 'Laporkan');
reportBtn.style.cssText = `
  position:absolute; bottom:80px; right:16px; z-index:1010;
  width:44px; height:44px; border-radius:50%; background:white;
  border:none; box-shadow:0 2px 6px rgba(0,0,0,.4); cursor:pointer;
  font-size:18px; display:flex; align-items:center; justify-content:center;
`;
viewerOverlay.appendChild(reportBtn);

// ===========================
// Module instances
// ===========================
let leafletMap: L.Map;
let positionMarker: PositionMarker;
let streetViewCard: StreetViewCard;
let panoramaViewer: PanoramaViewer | null = null;
let navigationArrows: NavigationArrows | null = null;
let miniMap: MiniMap | null = null;
let viewerControls: ViewerControls | null = null;
const reportModal = new ReportModal();

// ===========================
// Init
// ===========================
async function init(): Promise<void> {
  // Load map settings from API (with fallback)
  let settings;
  try {
    settings = await getMapSettings();
  } catch {
    settings = {
      name: 'Bawaan',
      center: { lat: 4.62, lon: 96.84 },
      zoom: 12,
      bounds: null,
    };
  }

  // Initialize Leaflet map
  leafletMap = initMap(settings);

  // Position marker (orange circle + heading cone)
  positionMarker = new PositionMarker(leafletMap);

  // Street View card (bottom-left)
  streetViewCard = new StreetViewCard(appRoot);
  streetViewCard.getElement().style.pointerEvents = 'auto';
  streetViewCard.onOpen(() => {
    if (state.currentPhoto) openViewer(state.currentPhoto);
  });

  // Coverage layer — load and handle clicks
  const coverage = createCoverageManager((photo: Photo) => {
    selectPhoto(photo);
  });
  await coverage.load(leafletMap);

  // Reload coverage when map moves
  let moveTimer: ReturnType<typeof setTimeout>;
  leafletMap.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => coverage.load(leafletMap), 400);
  });
}

async function selectPhoto(photo: Photo): Promise<void> {
  state.selectedPhotoId = photo.id;
  try {
    const detail = await getPhoto(photo.id);
    state.currentPhoto = detail;
    state.viewerHeading = detail.headingDeg;
    positionMarker.update(detail.lat, detail.lon, detail.headingDeg);
    leafletMap.panTo([detail.lat, detail.lon], { animate: true });
    streetViewCard.setPhoto(detail);
  } catch (err) {
    console.error('Gagal memuat foto:', err);
  }
}

function openViewer(photo: PhotoDetail): void {
  state.viewerOpen = true;
  viewerOverlay.style.display = 'block';
  document.body.style.overflow = 'hidden';

  if (!panoramaViewer) {
    panoramaViewer = new PanoramaViewer(viewerCanvas);
    panoramaViewer.onHeadingChange((heading) => {
      state.viewerHeading = heading;
      positionMarker.updateHeading(heading);
      miniMap?.update(
        state.currentPhoto?.lat ?? photo.lat,
        state.currentPhoto?.lon ?? photo.lon,
        heading,
      );
      if (state.currentPhoto) {
        navigationArrows?.updateArrows(state.currentPhoto.neighbors, heading);
      }
    });
  }

  if (!navigationArrows) {
    navigationArrows = new NavigationArrows(viewerCanvas, async (neighborId) => {
      await navigateTo(neighborId);
    });
  }

  if (!miniMap) {
    miniMap = new MiniMap(minimapEl);
  }

  if (!viewerControls) {
    viewerControls = new ViewerControls(viewerOverlay);
    viewerControls.render((action) => handleControlAction(action));
  }

  panoramaViewer.load(photo).then(() => {
    miniMap?.update(photo.lat, photo.lon, photo.headingDeg);
    navigationArrows?.updateArrows(photo.neighbors, state.viewerHeading);
    updateLocationInfo(photo);
    // Prefetch neighbor thumbnails
    for (const n of photo.neighbors) {
      const img = new Image();
      img.src = `/api/photos/thumb/${n.id}`;
    }
  });

  reportBtn.onclick = () => {
    if (state.currentPhoto) reportModal.show(state.currentPhoto.id);
  };
}

function updateLocationInfo(photo: PhotoDetail): void {
  locationInfo.innerHTML = `
    ${photo.near ? `<div class="place-name">${photo.near}</div>` : ''}
    <div class="coords">${Number(photo.lat).toFixed(5)}, ${Number(photo.lon).toFixed(5)}</div>
  `;
}

function closeViewer(): void {
  state.viewerOpen = false;
  viewerOverlay.style.display = 'none';
  document.body.style.overflow = '';
  navigationArrows?.clear();
  viewerControls?.destroy();
  viewerControls = null;
}

async function navigateTo(photoId: number): Promise<void> {
  try {
    const photo = await getPhoto(photoId);
    state.selectedPhotoId = photo.id;
    state.currentPhoto = photo;
    await panoramaViewer?.transitionTo(photo, state.viewerHeading);
    positionMarker.update(photo.lat, photo.lon, state.viewerHeading);
    miniMap?.update(photo.lat, photo.lon, state.viewerHeading);
    navigationArrows?.updateArrows(photo.neighbors, state.viewerHeading);
    updateLocationInfo(photo);
    streetViewCard.setPhoto(photo);
    // Prefetch
    for (const n of photo.neighbors) {
      const img = new Image();
      img.src = `/api/photos/thumb/${n.id}`;
    }
  } catch (err) {
    console.error('Navigasi gagal:', err);
  }
}

function handleControlAction(action: string): void {
  switch (action) {
    case 'back':
      closeViewer();
      break;
    case 'forward': {
      const fwd = findNeighborInDirection(state.viewerHeading);
      if (fwd) navigateTo(fwd.id);
      break;
    }
    case 'backward': {
      const bwd = findNeighborInDirection((state.viewerHeading + 180) % 360);
      if (bwd) navigateTo(bwd.id);
      break;
    }
    case 'turnLeft':
      panoramaViewer?.rotateBy(-30);
      break;
    case 'turnRight':
      panoramaViewer?.rotateBy(30);
      break;
  }
}

function findNeighborInDirection(
  targetBearing: number,
): { id: number; bearingDeg: number; distanceM: number; thumbUrl?: string } | null {
  if (!state.currentPhoto?.neighbors.length) return null;
  let best = null;
  let bestDiff = 181;
  for (const n of state.currentPhoto.neighbors) {
    let diff = Math.abs(n.bearingDeg - targetBearing);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; best = n; }
  }
  return best;
}

// Start
init().catch(console.error);
