export interface Photo {
  id: number;
  url: string;
  thumbUrl: string;
  lat: number;
  lon: number;
  headingDeg: number;
  northOffsetDeg: number;
  projection: 'equirectangular' | 'flat';
  distM?: number;
}

export interface PhotoNeighbor {
  id: number;
  bearingDeg: number;
  distanceM: number;
}

export interface PhotoDetail extends Photo {
  near: string | null;
  neighbors: PhotoNeighbor[];
}

export interface Place {
  id: number;
  name: string;
  category: string | null;
  lat: number;
  lon: number;
}

export interface MapSettings {
  name: string;
  center: { lat: number; lon: number };
  zoom: number;
  bounds: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  } | null;
}

type ApiErrorResponse = {
  error: { code: string; message: string };
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorResponse;
      errMsg = body.error?.message ?? errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

export async function getCoverage(bbox: string): Promise<GeoJSON.FeatureCollection> {
  return apiFetch<GeoJSON.FeatureCollection>(`/api/coverage?bbox=${encodeURIComponent(bbox)}`);
}

export async function getNearestPhoto(
  lat: number,
  lon: number,
  maxM = 30
): Promise<Photo | null> {
  try {
    return await apiFetch<Photo>(`/api/photos/nearest?lat=${lat}&lon=${lon}&maxM=${maxM}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('HTTP 404')) return null;
    throw err;
  }
}

export async function getPhoto(id: number): Promise<PhotoDetail> {
  return apiFetch<PhotoDetail>(`/api/photos/${id}`);
}

export async function getPlaces(q: string): Promise<Place[]> {
  return apiFetch<Place[]>(`/api/places?q=${encodeURIComponent(q)}`);
}

export async function postReport(
  photoId: number,
  type: 'privacy' | 'wrong_location' | 'other',
  note?: string
): Promise<void> {
  await apiFetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ photoId, type, note }),
  });
}

export async function getMapSettings(): Promise<MapSettings> {
  return apiFetch<MapSettings>('/api/settings/map');
}
