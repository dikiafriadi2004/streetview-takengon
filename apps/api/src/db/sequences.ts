import { pool } from './pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Sequence extends RowDataPacket {
  id: number;
  user_id: number;
  title: string;
  camera: string | null;
  recorded_at: string | null;
  status: 'draft' | 'published' | 'hidden';
}

export async function listSequences(): Promise<Sequence[]> {
  const [rows] = await pool.query<Sequence[]>(
    `SELECT id, user_id, title, camera, recorded_at, status
     FROM sequences ORDER BY id DESC`
  );
  return rows;
}

export async function createSequence(data: {
  userId: number;
  title: string;
  camera?: string;
  recordedAt?: string;
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO sequences (user_id, title, camera, recorded_at)
     VALUES (?, ?, ?, ?)`,
    [data.userId, data.title, data.camera ?? null, data.recordedAt ?? null]
  );
  return result.insertId;
}

export async function updateStatus(
  id: number,
  status: 'draft' | 'published' | 'hidden'
): Promise<void> {
  await pool.query<ResultSetHeader>(
    'UPDATE sequences SET status = ? WHERE id = ?',
    [status, id]
  );
}

export async function findOrCreateManualSequence(userId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM sequences WHERE title = 'Input manual' AND user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length > 0) {
    return rows[0].id as number;
  }
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO sequences (user_id, title, status) VALUES (?, 'Input manual', 'draft')`,
    [userId]
  );
  return result.insertId;
}

export async function getNextSeqIndex(sequenceId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(seq_index), -1) + 1 AS next_idx FROM photos WHERE sequence_id = ?',
    [sequenceId]
  );
  return rows[0].next_idx as number;
}

export interface BboxParams {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface CoverageFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: {
    sequenceId: number;
    title: string;
  };
}

export async function getCoverageGeoJSON(bbox: BboxParams): Promise<CoverageFeature[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.sequence_id, s.title,
            ST_X(p.location) AS lon, ST_Y(p.location) AS lat,
            p.seq_index
     FROM photos p
     JOIN sequences s ON s.id = p.sequence_id
     WHERE p.status = 'published'
       AND s.status = 'published'
       AND MBRContains(
         ST_GeomFromText(CONCAT('POLYGON((',
           ?, ' ', ?, ',', ?, ' ', ?, ',',
           ?, ' ', ?, ',', ?, ' ', ?, ',',
           ?, ' ', ?, '))'), 4326),
         p.location)
     ORDER BY p.sequence_id, p.seq_index`,
    [
      bbox.minLon, bbox.minLat,
      bbox.maxLon, bbox.minLat,
      bbox.maxLon, bbox.maxLat,
      bbox.minLon, bbox.maxLat,
      bbox.minLon, bbox.minLat,
    ]
  );

  // Group by sequence_id → LineString
  const seqMap = new Map<number, { title: string; coords: [number, number][] }>();
  for (const row of rows) {
    const sid = row.sequence_id as number;
    if (!seqMap.has(sid)) {
      seqMap.set(sid, { title: row.title as string, coords: [] });
    }
    seqMap.get(sid)!.coords.push([Number(row.lon), Number(row.lat)]);
  }

  const features: CoverageFeature[] = [];
  for (const [sequenceId, { title, coords }] of seqMap) {
    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { sequenceId, title },
      });
    }
  }
  return features;
}
