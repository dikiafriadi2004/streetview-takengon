import { pool } from './pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Place extends RowDataPacket {
  id: number;
  name: string;
  category: string | null;
  lat: number;
  lon: number;
  photo_id: number | null;
}

export async function searchByName(q: string): Promise<Place[]> {
  const [rows] = await pool.query<Place[]>(
    `SELECT id, name, category, photo_id,
            ST_Y(location) AS lat, ST_X(location) AS lon
     FROM places
     WHERE name LIKE ?
     LIMIT 20`,
    [`%${q}%`]
  );
  return rows;
}

export async function getNearest(lat: number, lon: number): Promise<Place | null> {
  const [rows] = await pool.query<Place[]>(
    `SELECT id, name, category, photo_id,
            ST_Y(location) AS lat, ST_X(location) AS lon,
            ST_Distance_Sphere(location,
              ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')
            ) AS dist_m
     FROM places
     ORDER BY dist_m
     LIMIT 1`,
    [lon, lat]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function createPlace(data: {
  name: string;
  category?: string;
  lat: number;
  lon: number;
  photoId?: number;
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO places (name, category, location, photo_id)
     VALUES (?, ?,
             ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat'),
             ?)`,
    [data.name, data.category ?? null, data.lon, data.lat, data.photoId ?? null]
  );
  return result.insertId;
}

export async function updatePlace(
  id: number,
  data: {
    name?: string;
    category?: string;
    lat?: number;
    lon?: number;
    photoId?: number;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category); }
  if (data.lat !== undefined && data.lon !== undefined) {
    sets.push("location = ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')");
    params.push(data.lon, data.lat);
  }
  if (data.photoId !== undefined) { sets.push('photo_id = ?'); params.push(data.photoId); }

  if (sets.length === 0) return;

  params.push(id);
  await pool.query<ResultSetHeader>(
    `UPDATE places SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
}

export async function deletePlace(id: number): Promise<void> {
  await pool.query<ResultSetHeader>('DELETE FROM places WHERE id = ?', [id]);
}

export async function listPlaces(): Promise<Place[]> {
  const [rows] = await pool.query<Place[]>(
    `SELECT id, name, category, photo_id,
            ST_Y(location) AS lat, ST_X(location) AS lon
     FROM places ORDER BY name`
  );
  return rows;
}
