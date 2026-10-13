import L from 'leaflet';
import { getCoverage, getNearestPhoto } from '../api/client.js';
import type { Photo } from '../api/client.js';

const COVERAGE_COLOR = '#2A7BE4';
const COVERAGE_WEIGHT = 4;
const CLICK_MAX_M = 30;

export interface CoverageManager {
  load(map: L.Map): Promise<void>;
  refresh(map: L.Map): Promise<void>;
}

type PhotoSelectedHandler = (photo: Photo) => void;

export function createCoverageManager(
  onPhotoSelected: PhotoSelectedHandler
): CoverageManager {
  let coverageLayer: L.GeoJSON | null = null;

  async function load(map: L.Map): Promise<void> {
    if (coverageLayer) {
      map.removeLayer(coverageLayer);
    }

    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ].join(',');

    try {
      const geojson = await getCoverage(bbox);

      coverageLayer = L.geoJSON(geojson, {
        style: {
          color: COVERAGE_COLOR,
          weight: COVERAGE_WEIGHT,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        },
      });

      // Add click handler with buffer
      coverageLayer.on('click', async (e: L.LeafletMouseEvent) => {
        const latlng = e.latlng;

        try {
          const photo = await getNearestPhoto(latlng.lat, latlng.lng, CLICK_MAX_M);
          if (photo) {
            onPhotoSelected(photo);
          }
        } catch (err) {
          console.warn('Gagal mencari foto terdekat:', err);
        }
      });

      // Make the lines easier to click by adding a wider invisible hit area
      coverageLayer.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
          const hitLine = L.polyline(layer.getLatLngs() as L.LatLng[], {
            color: 'transparent',
            weight: 30,
            opacity: 0,
          });

          hitLine.on('click', async (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            try {
              const photo = await getNearestPhoto(e.latlng.lat, e.latlng.lng, CLICK_MAX_M);
              if (photo) {
                onPhotoSelected(photo);
              }
            } catch (err) {
              console.warn('Gagal mencari foto terdekat:', err);
            }
          });

          hitLine.addTo(map);
        }
      });

      coverageLayer.addTo(map);
    } catch (err) {
      console.warn('Gagal memuat cakupan:', err);
    }
  }

  return { load, refresh: load };
}
