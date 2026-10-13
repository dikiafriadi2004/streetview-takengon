import 'leaflet/dist/leaflet.css';
import './styles/main.css';
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
import L from 'leaflet';

// Fix Leaflet default icon paths (Vite issue)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

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
const appRoot = document.getElementById('app-root')!;

// Map title box
const titleBox = document.createElement('div');
titleBox.className = 'map-title-box';
titleBox.textContent = i18n.appTitle;
titleBox.setAttribute('aria-label', i18n.appTitle);
document.body.appendChild(titleBox);

// Street View card container (on top of map)
const cardContainer = document.createElement('div');
cardContainer.style.position = 'absolute';
cardContainer.style.inset = '0';
cardContainer.style.pointerEvents = 'none';
cardContainer.style.zIndex = '400';
document.body.appendChild(cardContainer);

// Viewer overlay (hidden initially)
const viewerOverlay = document.createElement('div');
viewerOverlay.className = 'viewer-overlay';
viewerOverlay.style.display = 'none';
viewerOverlay.setAttribute('role', 'main');
viewerOverlay.setAttribute('aria-label', 'Penampil Street View');
document.body.appendChild(viewerOverlay);

// Viewer canvas (PSV container)
const viewerCanvas = document.createElement('div');
viewerCanvas.className = 'viewer-canvas';
viewerOverlay.appendChild(viewerCanvas);

// Minimap container
const minimapEl = document.createElement('div');
minimapEl.className = 'minimap';
minimapEl.setAttribute('aria-label', i18n.ariaMinimap);
viewerOverlay.appendChild(minimapEl);

// Location info
const locationInfo = document.createElement('div');
locationInfo.className = 'location-info';
viewerOverlay.appendChild(locationInfo);

// Report button
const reportBtn = document.createElement('button');
reportBtn.className = 'btn-secondary report-btn';
reportBtn.textContent = '🚩';
reportBtn.setAttribute('aria-label', i18n.report);
reportBtn.setAttribute('title', i18n.report);
reportBtn.style.cssText = `
  position: absolute; bottom: 80px; right: 16px; z-index: 1010;
  width: 44px; height: 44px; border-radius: 50%; background: white;
  border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;
  font-size: 18px; display: flex; align-items: center; justify-content: center;
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
  // Load map settings
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

  // Initialize map
  leafletMap = initMap(settings);
  positionMarker = new PositionMarker(leafletMap);

  // Street View card
  streetViewCard = new StreetViewCard(cardContainer);
  (streetViewCard.getElement() as HTMLElement).style.pointerEvents = 'auto';
  streetViewCard.onOpen(() => {
    if (state.currentPhoto) openViewer(state.currentPhoto);
  });

  // Coverage layer
  const coverage = createCoverageManager((photo: Photo) => {
    selectPhoto(photo);
  });

  // Load coverage initially
  await coverage.load(leafletMap);

  // Reload coverage on map move (debounced)
  let moveTimer: ReturnType<typeof setTimeout>;
  leafletMap.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => coverage.load(leafletMap), 300);
  });
}

async function selectPhoto(photo: Photo): Promise<void> {
  state.selectedPhotoId = photo.id;

  // Load full photo detail
  try {
    const detail = await getPhoto(photo.id);
    state.currentPhoto = detail;
    state.viewerHeading = detail.headingDeg;

    // Update map marker
    positionMarker.update(detail.lat, detail.lon, detail.headingDeg);

    // Pan map to show the photo
    leafletMap.panTo([detail.lat, detail.lon], { animate: true });

    // Update card
    streetViewCard.setPhoto(detail);
  } catch (err) {
    console.error('Gagal memuat foto:', err);
  }
}

function openViewer(photo: PhotoDetail): void {
  state.viewerOpen = true;
  viewerOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Initialize panorama viewer
  if (!panoramaViewer) {
    panoramaViewer = new PanoramaViewer(viewerCanvas);
    panoramaViewer.onHeadingChange((heading) => {
      state.viewerHeading = heading;
      positionMarker.updateHeading(heading);
      miniMap?.update(photo.lat, photo.lon, heading);

      // Update navigation arrows
      if (state.currentPhoto) {
        navigationArrows?.updateArrows(state.currentPhoto.neighbors, heading);
      }
    });
  }

  // Initialize navigation arrows
  if (!navigationArrows) {
    navigationArrows = new NavigationArrows(viewerCanvas, async (neighborId) => {
      await navigateTo(neighborId);
    });
  }

  // Initialize minimap
  if (!miniMap) {
    miniMap = new MiniMap(minimapEl);
  }

  // Initialize viewer controls
  if (!viewerControls) {
    viewerControls = new ViewerControls(viewerOverlay);
    viewerControls.render((action) => handleControlAction(action));
  }

  // Load the photo
  panoramaViewer.load(photo).then(() => {
    // Update minimap
    miniMap?.update(photo.lat, photo.lon, photo.headingDeg);

    // Update navigation arrows
    navigationArrows?.updateArrows(photo.neighbors, state.viewerHeading);

    // Update location info
    updateLocationInfo(photo);
  });

  // Report button handler
  reportBtn.onclick = () => {
    if (state.currentPhoto) {
      reportModal.show(state.currentPhoto.id);
    }
  };
}

function updateLocationInfo(photo: PhotoDetail): void {
  locationInfo.innerHTML = `
    ${photo.near ? `<div class="place-name">${photo.near}</div>` : ''}
    <div class="coords">${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}</div>
  `;
}

function closeViewer(): void {
  state.viewerOpen = false;
  viewerOverlay.style.display = 'none';
  document.body.style.overflow = '';

  navigationArrows?.clear();

  // Destroy controls (keyboard handler)
  viewerControls?.destroy();
  viewerControls = null;
}

async function navigateTo(photoId: number): Promise<void> {
  try {
    const photo = await getPhoto(photoId);
    state.selectedPhotoId = photo.id;
    state.currentPhoto = photo;

    // Transition with maintained compass heading
    await panoramaViewer?.transitionTo(photo, state.viewerHeading);

    // Update marker on main map
    positionMarker.update(photo.lat, photo.lon, state.viewerHeading);

    // Update minimap
    miniMap?.update(photo.lat, photo.lon, state.viewerHeading);

    // Update arrows
    navigationArrows?.updateArrows(photo.neighbors, state.viewerHeading);

    // Update location info
    updateLocationInfo(photo);

    // Update card (for when returning to map)
    streetViewCard.setPhoto(photo);

    // Prefetch neighbor thumbnails
    for (const n of photo.neighbors) {
      const img = new window.Image();
      img.src = `/api/photos/${n.id}/thumb`; // Trigger load
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
      // Find the neighbor closest to current heading
      if (!state.currentPhoto?.neighbors.length) break;
      const fwd = findNeighborInDirection(state.viewerHeading, 0);
      if (fwd) navigateTo(fwd.id);
      break;
    }
    case 'backward': {
      // Navigate to neighbor ~180° from current heading
      if (!state.currentPhoto?.neighbors.length) break;
      const bwd = findNeighborInDirection((state.viewerHeading + 180) % 360, 0);
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
  tolerance: number
): { id: number; bearingDeg: number; distanceM: number } | null {
  if (!state.currentPhoto?.neighbors.length) return null;

  let best = null;
  let bestDiff = 181;

  for (const n of state.currentPhoto.neighbors) {
    let diff = Math.abs(n.bearingDeg - targetBearing);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = n;
    }
  }

  return best;
}

// Start the app
init().catch(console.error);
