import { pool } from './pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface MapArea extends RowDataPacket {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  zoom: number;
  min_lat: number | null;
  min_lon: number | null;
  max_lat: number | null;
  max_lon: number | null;
  is_active: number;
  updated_at: string;
}

export async function getActive(): Promise<MapArea | null> {
  const [rows] = await pool.query<MapArea[]>(
    `SELECT id, name, center_lat, center_lon, zoom,
            min_lat, min_lon, max_lat, max_lon, is_active, updated_at
     FROM map_areas WHERE is_active = 1 LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function listMapAreas(): Promise<MapArea[]> {
  const [rows] = await pool.query<MapArea[]>(
    `SELECT id, name, center_lat, center_lon, zoom,
            min_lat, min_lon, max_lat, max_lon, is_active, updated_at
     FROM map_areas ORDER BY is_active DESC, name`
  );
  return rows;
}

export async function createMapArea(data: {
  name: string;
  centerLat: number;
  centerLon: number;
  zoom: number;
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO map_areas (name, center_lat, center_lon, zoom, min_lat, min_lon, max_lat, max_lon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.centerLat,
      data.centerLon,
      data.zoom,
      data.minLat ?? null,
      data.minLon ?? null,
      data.maxLat ?? null,
      data.maxLon ?? null,
    ]
  );
  return result.insertId;
}

export async function updateMapArea(
  id: number,
  data: {
    name?: string;
    centerLat?: number;
    centerLon?: number;
    zoom?: number;
    minLat?: number | null;
    minLon?: number | null;
    maxLat?: number | null;
    maxLon?: number | null;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.centerLat !== undefined) { sets.push('center_lat = ?'); params.push(data.centerLat); }
  if (data.centerLon !== undefined) { sets.push('center_lon = ?'); params.push(data.centerLon); }
  if (data.zoom !== undefined) { sets.push('zoom = ?'); params.push(data.zoom); }
  if ('minLat' in data) { sets.push('min_lat = ?'); params.push(data.minLat ?? null); }
  if ('minLon' in data) { sets.push('min_lon = ?'); params.push(data.minLon ?? null); }
  if ('maxLat' in data) { sets.push('max_lat = ?'); params.push(data.maxLat ?? null); }
  if ('maxLon' in data) { sets.push('max_lon = ?'); params.push(data.maxLon ?? null); }

  if (sets.length === 0) return;
  params.push(id);
  await pool.query<ResultSetHeader>(
    `UPDATE map_areas SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
}

export async function deleteMapArea(id: number): Promise<void> {
  await pool.query<ResultSetHeader>('DELETE FROM map_areas WHERE id = ?', [id]);
}

/**
 * Activate a map area in a single transaction:
 * deactivate all, then activate the target one.
 */
export async function activateMapArea(id: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE map_areas SET is_active = 0');
    await conn.query('UPDATE map_areas SET is_active = 1 WHERE id = ?', [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
