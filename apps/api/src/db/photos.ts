import { pool } from './pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Photo extends RowDataPacket {
  id: number;
  sequence_id: number;
  seq_index: number;
  file_path: string;
  thumb_path: string;
  heading_deg: number;
  north_offset_deg: number;
  projection: 'equirectangular' | 'flat';
  lat: number;
  lon: number;
  status: 'draft' | 'published' | 'hidden';
  captured_at: string | null;
}

export interface PhotoDetail extends Photo {
  near: string | null;
  neighbors: Array<{ id: number; bearingDeg: number; distanceM: number }>;
}

export interface NearestPhoto extends RowDataPacket {
  id: number;
  file_path: string;
  thumb_path: string;
  heading_deg: number;
  north_offset_deg: number;
  projection: 'equirectangular' | 'flat';
  lat: number;
  lon: number;
  dist_m: number;
}

/**
 * Find the nearest published photo within maxM meters.
 * Uses bounding box (spatial index) first, then ST_Distance_Sphere.
 */
export async function findNearest(
  lat: number,
  lon: number,
  maxM: number
): Promise<NearestPhoto | null> {
  const degPerMeter = 1 / 111320;
  const delta = maxM * degPerMeter;
  const minLon = lon - delta;
  const maxLon = lon + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;

  const [rows] = await pool.query<NearestPhoto[]>(
    `SELECT id, file_path, thumb_path, heading_deg, north_offset_deg, projection,
            ST_Y(location) AS lat, ST_X(location) AS lon,
            ST_Distance_Sphere(location,
              ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')
            ) AS dist_m
     FROM photos
     WHERE status = 'published'
       AND MBRContains(
         ST_GeomFromText(CONCAT('POLYGON((',
           ?, ' ', ?, ',', ?, ' ', ?, ',',
           ?, ' ', ?, ',', ?, ' ', ?, ',',
           ?, ' ', ?, '))'), 4326, 'axis-order=long-lat'),
         location)
     ORDER BY dist_m
     LIMIT 1`,
    [
      lon, lat,
      minLon, minLat,
      maxLon, minLat,
      maxLon, maxLat,
      minLon, maxLat,
      minLon, minLat,
    ]
  );

  if (!rows.length) return null;
  const photo = rows[0];
  if (photo.dist_m > maxM) return null;
  return photo;
}

/**
 * Find a photo by ID with its neighbors and nearest place name.
 */
export async function findById(id: number): Promise<PhotoDetail | null> {
  const [rows] = await pool.query<Photo[]>(
    `SELECT id, sequence_id, seq_index, file_path, thumb_path,
            heading_deg, north_offset_deg, projection, status,
            ST_Y(location) AS lat, ST_X(location) AS lon,
            captured_at
     FROM photos
     WHERE id = ?`,
    [id]
  );

  if (!rows.length) return null;
  const photo = rows[0];

  // Get neighbors via photo_links
  const [linkRows] = await pool.query<RowDataPacket[]>(
    `SELECT pl.to_photo_id AS id, pl.bearing_deg AS bearingDeg, pl.distance_m AS distanceM
     FROM photo_links pl
     WHERE pl.from_photo_id = ?
     ORDER BY pl.bearing_deg`,
    [id]
  );

  // Get nearest place name
  const [placeRows] = await pool.query<RowDataPacket[]>(
    `SELECT name,
            ST_Distance_Sphere(location,
              ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')
            ) AS dist_m
     FROM places
     ORDER BY dist_m
     LIMIT 1`,
    [photo.lon, photo.lat]
  );

  const near = placeRows.length > 0 ? (placeRows[0].name as string) : null;

  return {
    ...photo,
    near,
    neighbors: linkRows as Array<{ id: number; bearingDeg: number; distanceM: number }>,
  };
}

export async function updateStatus(
  id: number,
  status: 'draft' | 'published' | 'hidden'
): Promise<void> {
  await pool.query<ResultSetHeader>(
    'UPDATE photos SET status = ? WHERE id = ?',
    [status, id]
  );
}

export async function updateLocation(
  id: number,
  lat: number,
  lon: number,
  northOffsetDeg?: number
): Promise<void> {
  if (northOffsetDeg !== undefined) {
    await pool.query<ResultSetHeader>(
      `UPDATE photos
       SET location = ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat'),
           north_offset_deg = ?
       WHERE id = ?`,
      [lon, lat, northOffsetDeg, id]
    );
  } else {
    await pool.query<ResultSetHeader>(
      `UPDATE photos
       SET location = ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')
       WHERE id = ?`,
      [lon, lat, id]
    );
  }
}

export interface InsertPhotoData {
  sequenceId: number;
  seqIndex: number;
  lat: number;
  lon: number;
  headingDeg: number;
  northOffsetDeg?: number;
  projection?: 'equirectangular' | 'flat';
  filePath: string;
  thumbPath: string;
  status?: 'draft' | 'published' | 'hidden';
  capturedAt?: Date | null;
  altitudeM?: number | null;
}

export async function insertPhoto(data: InsertPhotoData): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO photos
       (sequence_id, seq_index, location, heading_deg, north_offset_deg, projection,
        file_path, thumb_path, status, captured_at, altitude_m)
     VALUES
       (?, ?,
        ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat'),
        ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.sequenceId,
      data.seqIndex,
      data.lon,
      data.lat,
      data.headingDeg,
      data.northOffsetDeg ?? 0,
      data.projection ?? 'equirectangular',
      data.filePath,
      data.thumbPath,
      data.status ?? 'draft',
      data.capturedAt ?? null,
      data.altitudeM ?? null,
    ]
  );
  return result.insertId;
}

export async function deletePhoto(id: number): Promise<void> {
  // Remove photo_links first (both directions)
  await pool.query('DELETE FROM photo_links WHERE from_photo_id = ? OR to_photo_id = ?', [id, id]);
  await pool.query('DELETE FROM photos WHERE id = ?', [id]);
}

export interface AdminPhotoFilter {
  sequenceId?: number;
  status?: string;
}

export async function listAdminPhotos(filter: AdminPhotoFilter): Promise<RowDataPacket[]> {
  let sql = `SELECT id, sequence_id, seq_index, file_path, thumb_path,
                    heading_deg, north_offset_deg, projection, status,
                    ST_Y(location) AS lat, ST_X(location) AS lon, captured_at
             FROM photos WHERE 1=1`;
  const params: (string | number)[] = [];

  if (filter.sequenceId !== undefined) {
    sql += ' AND sequence_id = ?';
    params.push(filter.sequenceId);
  }
  if (filter.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  sql += ' ORDER BY sequence_id, seq_index';
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows;
}
